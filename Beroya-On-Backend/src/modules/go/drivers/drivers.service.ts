import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GoDocumentType,
  GoDriverKind,
  GoDriverPhoneChangeStatus,
  GoRideRequirementType,
  GoRole,
  Prisma,
} from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { maskPhone } from '../stores/store-money';
import { passportIconMime } from '../passport/passport-icon.storage';
import { DriverAvatarStorage } from './driver-avatar.storage';
import { DriverDocumentStorageService, type StoredImage } from './driver-document-storage.service';
import { DriverVehiclePhotoStorage } from './driver-vehicle-photo.storage';
import type { CreateDriverDto, DriverDocumentInput, DriverListState, UpdateDriverDto, UpsertDocumentDto } from './dto/drivers.dto';

const STATE_WHERE: Record<DriverListState, Prisma.GoDriverProfileWhereInput> = {
  active: { is_suspended: false, operational_blocked: false, user: { is_active: true } },
  suspended: { is_suspended: true },
  blocked: { operational_blocked: true },
  disabled: { user: { is_active: false } },
};

const OLDEST_BIRTH_DATE = new Date('1900-01-01T00:00:00Z');

function birthDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date < OLDEST_BIRTH_DATE || date.getTime() > Date.now()) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'date_of_birth must be a past date from 1900 on', {
      errors: [{ field: 'date_of_birth', messages: ['date_of_birth must be a past date from 1900 on'] }],
    });
  }
  return date;
}

/** أ إ آ ٱ → ا, ة → ه, ى → ي; the trailing tatweel (ـ) has no counterpart so translate() drops it. */
const FOLD_FROM = '\u0623\u0625\u0622\u0671\u0629\u0649\u0640';
const FOLD_TO = '\u0627\u0627\u0627\u0627\u0647\u064A';
const TASHKEEL_PATTERN = '[\u064B-\u0652]';

function foldArabic(value: string) {
  let out = value.replace(/[\u064B-\u0652]/g, '');
  for (let i = 0; i < FOLD_FROM.length; i += 1) out = out.split(FOLD_FROM[i]).join(FOLD_TO[i] ?? '');
  return out;
}

function toLatinDigits(value: string) {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function phoneTaken() {
  const message = 'Another driver account already uses this phone';
  return new GoException(GoErrorCode.CONFLICT, message, { errors: [{ field: 'phone', messages: [message] }] });
}

const EXTERNAL_DOCUMENTS: GoDocumentType[] = [
  GoDocumentType.LICENSE,
  GoDocumentType.VEHICLE_REGISTRATION,
  GoDocumentType.INSURANCE,
  GoDocumentType.IDENTITY,
];

/** Beroya drivers link vehicles later — only personal docs at create. */
const BEROYA_DOCUMENTS: GoDocumentType[] = [GoDocumentType.LICENSE, GoDocumentType.IDENTITY];

const EXPIRING_DOCUMENTS = new Set<GoDocumentType>([
  GoDocumentType.LICENSE,
  GoDocumentType.VEHICLE_REGISTRATION,
  GoDocumentType.INSURANCE,
]);

const driverInclude = {
  user: { select: { id: true, phone: true, full_name: true, is_active: true, role: true } },
  branch: { select: { id: true, code: true, name_ar: true } },
  active_vehicle: {
    include: {
      capabilities: true,
      ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
      ride_categories: {
        include: { ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } } },
      },
    },
  },
  documents: true,
  vehicle_photos: { orderBy: { sort_order: 'asc' } },
  vehicles: {
    include: {
      capabilities: true,
      ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } },
      ride_categories: {
        include: { ride_category: { select: { id: true, code: true, name_ar: true, name_en: true } } },
      },
    },
  },
  state: {
    select: { availability: true, last_lat: true, last_lng: true, last_location_at: true },
  },
  wallet: {
    select: { id: true, balance: true, outstanding_due: true, last_commission_amount: true },
  },
  passport: {
    select: {
      hidden_score: true,
      completed_rides: true,
      current_level: { select: { id: true, name_ar: true, name_en: true, minimum_score: true } },
    },
  },
} satisfies Prisma.GoDriverProfileInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly audit: AuditService,
    private readonly documents: DriverDocumentStorageService,
    private readonly vehiclePhotos: DriverVehiclePhotoStorage,
    private readonly avatars: DriverAvatarStorage,
  ) {}

  async list(user: AuthUser, page = 1, limit = 20, branchId?: string, search: { q?: string; state?: DriverListState } = {}) {
    const filter = this.branchScope.resolveFilter(user, branchId);
    const and: Prisma.GoDriverProfileWhereInput[] = [];
    if (filter) and.push({ branch_id: filter });
    if (search.state) and.push(STATE_WHERE[search.state]);
    if (search.q) {
      const words = toLatinDigits(search.q).split(/\s+/).filter(Boolean).slice(0, 5);
      for (const word of words) and.push(await this.searchWhere(word));
    }
    return this.prisma.goDriverProfile.findMany({
      where: and.length ? { AND: and } : {},
      include: driverInclude,
      orderBy: { created_at: 'desc' },
      ...pageSkip(page, limit),
    });
  }

  /**
   * One search word: name (ignoring Arabic spelling variants, tashkeel and tatweel), plate, or phone digits.
   * The caller ANDs the words, so "أحمد 0992" narrows by both.
   */
  private async searchWhere(word: string): Promise<Prisma.GoDriverProfileWhereInput> {
    const text = word.trim();
    const name = foldArabic(text.toLowerCase());
    const matches = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM go_driver_profiles p JOIN users u ON u.id = p.user_id
      WHERE translate(regexp_replace(lower(coalesce(u.full_name, '')), ${TASHKEEL_PATTERN}, '', 'g'), ${FOLD_FROM}, ${FOLD_TO})
            LIKE ${'%' + likeEscape(name) + '%'}
      LIMIT 500`;
    const or: Prisma.GoDriverProfileWhereInput[] = [
      { id: { in: matches.map((row) => row.id) } },
      { active_vehicle: { plate_number: { contains: likeEscape(text), mode: 'insensitive' } } },
    ];
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 3) {
      const international = digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? `963${digits.slice(1)}` : digits;
      or.push({ user: { phone: { contains: international } } });
      if (international !== digits) or.push({ user: { phone: { contains: digits } } });
    }
    return { OR: or };
  }

  async get(id: string, user?: AuthUser) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { id }, include: driverInclude });
    if (!driver) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver not found');
    if (user && driver.branch_id) this.branchScope.assertAccess(user, driver.branch_id);
    return driver;
  }

  async fleet(user: AuthUser, requestedBranch?: string) {
    const filter = this.branchScope.resolveFilter(user, requestedBranch);
    return this.prisma.goDriverProfile.findMany({
      where: filter ? { branch_id: filter } : {},
      select: {
        id: true,
        is_suspended: true,
        operational_blocked: true,
        user: { select: { full_name: true, phone: true, is_active: true } },
        branch: { select: { id: true, name_ar: true, code: true } },
        active_vehicle: { select: { id: true, plate_number: true } },
        state: {
          select: { availability: true, last_lat: true, last_lng: true, last_location_at: true },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 200,
    });
  }

  async create(actor: AuthUser, dto: CreateDriverDto) {
    if (dto.branch_id) this.branchScope.assertAccess(actor, dto.branch_id);
    const existing = await this.prisma.user.findUnique({
      where: { phone_role: { phone: dto.phone, role: GoRole.DRIVER } },
    });
    if (existing) throw new GoException(GoErrorCode.CONFLICT, 'Driver account already exists for this phone');

    const kind = dto.kind ?? GoDriverKind.EXTERNAL;
    const requiredDocs = kind === GoDriverKind.BEROYA ? BEROYA_DOCUMENTS : EXTERNAL_DOCUMENTS;
    const prepared = this.prepareDocuments(dto.documents, requiredDocs);

    const withVehicle = kind === GoDriverKind.EXTERNAL;
    if (withVehicle && (!dto.vehicle || !dto.vehicle_photos?.length)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'vehicle and vehicle_photos are required for EXTERNAL drivers');
    }

    const preparedPhotos = withVehicle ? this.prepareVehiclePhotos(dto.vehicle_photos ?? []) : [];
    let categoryIds: string[] = [];
    let primaryCategory: { id: string; code: string; name_ar: string } | null = null;
    let capabilities: GoRideRequirementType[] = [];
    if (withVehicle && dto.vehicle) {
      categoryIds = [...new Set(dto.vehicle.ride_category_ids.filter(Boolean))];
      if (!categoryIds.length) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'At least one ride category is required');
      }
      const categories = await this.prisma.goRideCategory.findMany({
        where: { id: { in: categoryIds }, is_active: true },
        select: { id: true, code: true, name_ar: true },
      });
      if (categories.length !== categoryIds.length) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'ride_category_ids must be active ride categories');
      }
      primaryCategory = categories.find((item) => item.id === categoryIds[0]) ?? categories[0];
      capabilities = this.assertVehicleCapabilities(dto.vehicle.capabilities);
    }

    // Upload to R2/local outside the DB transaction — network I/O must not hold the TX open.
    const profileId = randomUUID();
    const vehicleId = withVehicle ? randomUUID() : null;
    const savedDocs: string[] = [];
    const savedPhotos: string[] = [];
    const documentRows: {
      type: GoDocumentType;
      expires_at: Date | null;
      is_valid: boolean;
      image_key: string;
      image_back_key: string | null;
    }[] = [];
    const photoRows: { id: string; image_key: string; sort_order: number }[] = [];
    try {
      for (const doc of prepared) {
        const image_key = await this.documents.save(profileId, doc.type, doc.front.data, doc.front.image);
        savedDocs.push(image_key);
        let image_back_key: string | null = null;
        if (doc.back) {
          image_back_key = await this.documents.save(profileId, doc.type, doc.back.data, doc.back.image, 'back');
          savedDocs.push(image_back_key);
        }
        documentRows.push({
          type: doc.type,
          expires_at: doc.expires_at,
          is_valid: this.validFromExpiry(doc.expires_at),
          image_key,
          image_back_key,
        });
      }
      for (let index = 0; index < preparedPhotos.length; index += 1) {
        const photo = preparedPhotos[index];
        const id = randomUUID();
        const image_key = await this.vehiclePhotos.save(profileId, id, photo.data, photo.image);
        savedPhotos.push(image_key);
        photoRows.push({ id, image_key, sort_order: index });
      }

      const driver = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { phone: dto.phone, role: GoRole.DRIVER, full_name: dto.full_name, branch_id: dto.branch_id },
        });
        const spoken = this.mergeSpokenLanguages(dto.mother_tongue, dto.languages);
        await tx.goDriverProfile.create({
          data: {
            id: profileId,
            user_id: user.id,
            branch_id: dto.branch_id,
            gender: dto.gender,
            kind,
            mother_tongue: dto.mother_tongue,
            languages: spoken,
          },
        });
        for (const row of documentRows) {
          await tx.goDriverDocument.create({
            data: { driver_id: profileId, ...row },
          });
        }
        for (const row of photoRows) {
          await tx.goDriverVehiclePhoto.create({
            data: { driver_id: profileId, ...row },
          });
        }
        if (withVehicle && dto.vehicle && primaryCategory && vehicleId) {
          await tx.goVehicle.create({
            data: {
              id: vehicleId,
              plate_number: dto.vehicle.plate_number,
              driver_id: profileId,
              branch_id: dto.branch_id,
              ride_category_id: primaryCategory.id,
              make: dto.vehicle.make,
              model: dto.vehicle.model,
              color: dto.vehicle.color,
              year: dto.vehicle.year,
              capabilities: capabilities.length
                ? { create: capabilities.map((type) => ({ type })) }
                : undefined,
              ride_categories: {
                create: categoryIds.map((ride_category_id) => ({ ride_category_id })),
              },
            },
          });
          await tx.goDriverProfile.update({
            where: { id: profileId },
            data: { active_vehicle_id: vehicleId },
          });
        }
        return tx.goDriverProfile.findUniqueOrThrow({ where: { id: profileId }, include: driverInclude });
      });
      await this.audit.log({
        actor,
        action: 'driver.created',
        entity_type: 'go_driver_profile',
        entity_id: driver.id,
        branch_id: driver.branch_id,
        metadata: {
          kind,
          documents: prepared.map((doc) => doc.type),
          vehicle_photos: photoRows.length,
          vehicle_id: vehicleId,
          ride_category_ids: categoryIds,
          ride_category_id: primaryCategory?.id ?? null,
          ride_category_code: primaryCategory?.code ?? null,
        },
      });
      return driver;
    } catch (error) {
      for (const key of savedDocs) await this.documents.remove(key);
      for (const key of savedPhotos) await this.vehiclePhotos.remove(key);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new GoException(GoErrorCode.CONFLICT, 'Plate number already exists');
      }
      throw error;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateDriverDto) {
    const current = await this.get(id, actor);
    if (dto.branch_id) this.branchScope.assertAccess(actor, dto.branch_id);
    if (dto.active_vehicle_id) {
      const vehicle = await this.prisma.goVehicle.findUnique({ where: { id: dto.active_vehicle_id } });
      if (!vehicle || vehicle.driver_id !== id) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'active_vehicle_id must belong to this driver');
      }
    }

    const { avatar, remove_avatar, phone, ...fields } = dto;
    const oldPhone = current.user.phone;
    const phoneChanged = phone !== undefined && phone !== oldPhone;
    if (phoneChanged) {
      const taken = await this.prisma.user.findUnique({
        where: { phone_role: { phone, role: GoRole.DRIVER } },
        select: { id: true },
      });
      if (taken) throw phoneTaken();
    }
    let avatar_key: string | null | undefined;
    if (avatar) {
      avatar_key = await this.avatars.save(id, avatar);
    } else if (remove_avatar) {
      await this.avatars.remove(current.avatar_key);
      avatar_key = null;
    }

    const driver = await this.prisma.$transaction(async (tx) => {
      if (dto.full_name !== undefined || dto.user_is_active !== undefined || phoneChanged) {
        await tx.user.update({
          where: { id: current.user_id },
          data: { full_name: dto.full_name, is_active: dto.user_is_active, phone: phoneChanged ? phone : undefined },
        });
      }
      if (phoneChanged && phone) {
        const appliedAt = new Date();
        await tx.goUserSession.updateMany({
          where: { user_id: current.user_id, revoked_at: null },
          data: { revoked_at: appliedAt },
        });
        // Staff dashboard change applies immediately — drop any mobile OTP requests still pending.
        await tx.goDriverPhoneChangeRequest.updateMany({
          where: { driver_id: id, status: GoDriverPhoneChangeStatus.PENDING },
          data: {
            status: GoDriverPhoneChangeStatus.CANCELLED,
            reviewed_by_id: actor.id,
            reviewed_at: appliedAt,
            reject_reason: 'Superseded by staff dashboard phone change',
          },
        });
        await tx.goDriverPhoneChangeRequest.create({
          data: {
            driver_id: id,
            user_id: current.user_id,
            branch_id: current.branch_id,
            current_phone: oldPhone ?? '',
            requested_phone: phone,
            status: GoDriverPhoneChangeStatus.STAFF_APPLIED,
            otp_verified_at: appliedAt,
            reviewed_by_id: actor.id,
            reviewed_at: appliedAt,
          },
        });
      }
      const mother_tongue = dto.mother_tongue === undefined ? undefined : dto.mother_tongue;
      const languages =
        dto.mother_tongue !== undefined || dto.languages !== undefined
          ? this.mergeSpokenLanguages(
              dto.mother_tongue ?? current.mother_tongue ?? 'ar',
              dto.languages ?? current.languages.filter((item) => item !== (dto.mother_tongue ?? current.mother_tongue)),
            )
          : undefined;
      const date_of_birth =
        dto.date_of_birth === undefined
          ? undefined
          : dto.date_of_birth === null
            ? null
            : birthDate(dto.date_of_birth);
      return tx.goDriverProfile.update({
        where: { id },
        data: {
          branch_id: dto.branch_id === undefined ? undefined : dto.branch_id,
          gender: dto.gender,
          date_of_birth,
          mother_tongue,
          languages,
          is_suspended: dto.is_suspended,
          suspended_reason: dto.suspended_reason === undefined ? undefined : dto.suspended_reason,
          operational_blocked: dto.operational_blocked,
          operational_reason: dto.operational_reason === undefined ? undefined : dto.operational_reason,
          active_vehicle_id: dto.active_vehicle_id === undefined ? undefined : dto.active_vehicle_id,
          avatar_key,
        },
        include: driverInclude,
      });
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw phoneTaken();
      }
      throw error;
    });

    await this.audit.log({
      actor,
      action: 'driver.updated',
      entity_type: 'go_driver_profile',
      entity_id: id,
      branch_id: driver.branch_id,
      metadata: {
        ...fields,
        avatar: avatar ? true : undefined,
        remove_avatar,
        ...(phoneChanged ? { phone: { from: maskPhone(oldPhone), to: maskPhone(phone) }, sessions_revoked: true } : {}),
      } as Prisma.InputJsonValue,
    });
    return driver;
  }

  async readAvatar(actor: AuthUser, id: string) {
    const driver = await this.get(id, actor);
    const data = driver.avatar_key ? await this.avatars.read(driver.avatar_key) : null;
    if (!driver.avatar_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver photo not found');
    return { data, mime: passportIconMime(driver.avatar_key) };
  }

  async upsertDocument(actor: AuthUser, driverId: string, dto: UpsertDocumentDto) {
    await this.get(driverId, actor);
    const existing = await this.prisma.goDriverDocument.findUnique({
      where: { driver_id_type: { driver_id: driverId, type: dto.type } },
    });
    const expires_at = this.expiryFor(dto.type, dto.expires_at, existing?.expires_at ?? null);
    const is_valid = this.validFromExpiry(expires_at);
    if (!dto.image && !existing?.image_key) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Front document image is required');
    }
    const previousFront = existing?.image_key ?? null;
    const previousBack = existing?.image_back_key ?? null;
    let image_key = previousFront;
    let image_back_key = previousBack;
    const written: string[] = [];
    if (dto.image) {
      const decoded = this.decodeImage(dto.image);
      image_key = await this.documents.save(driverId, dto.type, decoded.data, decoded.image);
      written.push(image_key);
    }
    if (dto.image_back) {
      const decoded = this.decodeImage(dto.image_back);
      image_back_key = await this.documents.save(driverId, dto.type, decoded.data, decoded.image, 'back');
      written.push(image_back_key);
    }
    try {
      const doc = await this.prisma.goDriverDocument.upsert({
        where: { driver_id_type: { driver_id: driverId, type: dto.type } },
        create: {
          driver_id: driverId,
          type: dto.type,
          expires_at,
          is_valid,
          image_key,
          image_back_key,
        },
        update: {
          expires_at,
          is_valid,
          image_key,
          image_back_key,
        },
      });
      await this.audit.log({
        actor,
        action: 'driver.document_upserted',
        entity_type: 'go_driver_document',
        entity_id: doc.id,
        metadata: { type: dto.type },
      });
      if (previousFront && previousFront !== image_key) await this.documents.remove(previousFront);
      if (previousBack && previousBack !== image_back_key) await this.documents.remove(previousBack);
      return doc;
    } catch (error) {
      for (const key of written) {
        if (key !== previousFront && key !== previousBack) await this.documents.remove(key);
      }
      throw error;
    }
  }

  async readDocumentImage(actor: AuthUser, driverId: string, type: GoDocumentType, side: 'front' | 'back' = 'front') {
    await this.get(driverId, actor);
    const doc = await this.prisma.goDriverDocument.findUnique({
      where: { driver_id_type: { driver_id: driverId, type } },
    });
    const key = side === 'back' ? doc?.image_back_key : doc?.image_key;
    if (!key) throw new GoException(GoErrorCode.NOT_FOUND, 'Document image not found');
    const data = await this.documents.read(key);
    if (!data) throw new GoException(GoErrorCode.NOT_FOUND, 'Document image not found');
    return { data, mime: mimeOf(key) };
  }

  async readVehiclePhoto(actor: AuthUser, driverId: string, photoId: string) {
    await this.get(driverId, actor);
    const photo = await this.prisma.goDriverVehiclePhoto.findFirst({
      where: { id: photoId, driver_id: driverId },
    });
    if (!photo) throw new GoException(GoErrorCode.NOT_FOUND, 'Vehicle photo not found');
    const data = await this.vehiclePhotos.read(photo.image_key);
    if (!data) throw new GoException(GoErrorCode.NOT_FOUND, 'Vehicle photo not found');
    return { data, mime: mimeOf(photo.image_key) };
  }

  /**
   * Attach VEHICLE_REGISTRATION + INSURANCE + car photos to a driver (used by vehicle create).
   * Replaces existing docs of those types and replaces all vehicle photos.
   */
  async attachVehicleOnboarding(
    actor: AuthUser,
    driverId: string,
    input: { documents: DriverDocumentInput[]; vehicle_photos: string[] },
  ) {
    await this.get(driverId, actor);
    const required = [GoDocumentType.VEHICLE_REGISTRATION, GoDocumentType.INSURANCE];
    const prepared = this.prepareDocuments(input.documents, required);
    const preparedPhotos = this.prepareVehiclePhotos(input.vehicle_photos);

    const existingDocs = await this.prisma.goDriverDocument.findMany({
      where: { driver_id: driverId, type: { in: required } },
    });
    const existingPhotos = await this.prisma.goDriverVehiclePhoto.findMany({
      where: { driver_id: driverId },
    });

    const savedDocs: string[] = [];
    const savedPhotos: string[] = [];
    const documentRows: {
      type: GoDocumentType;
      expires_at: Date | null;
      is_valid: boolean;
      image_key: string;
      image_back_key: string | null;
    }[] = [];
    const photoRows: { id: string; image_key: string; sort_order: number }[] = [];

    try {
      for (const doc of prepared) {
        const image_key = await this.documents.save(driverId, doc.type, doc.front.data, doc.front.image);
        savedDocs.push(image_key);
        let image_back_key: string | null = null;
        if (doc.back) {
          image_back_key = await this.documents.save(driverId, doc.type, doc.back.data, doc.back.image, 'back');
          savedDocs.push(image_back_key);
        }
        documentRows.push({
          type: doc.type,
          expires_at: doc.expires_at,
          is_valid: this.validFromExpiry(doc.expires_at),
          image_key,
          image_back_key,
        });
      }
      for (let index = 0; index < preparedPhotos.length; index += 1) {
        const photo = preparedPhotos[index];
        const id = randomUUID();
        const image_key = await this.vehiclePhotos.save(driverId, id, photo.data, photo.image);
        savedPhotos.push(image_key);
        photoRows.push({ id, image_key, sort_order: index });
      }

      await this.prisma.$transaction(async (tx) => {
        for (const row of documentRows) {
          await tx.goDriverDocument.upsert({
            where: { driver_id_type: { driver_id: driverId, type: row.type } },
            create: { driver_id: driverId, ...row },
            update: {
              expires_at: row.expires_at,
              is_valid: row.is_valid,
              image_key: row.image_key,
              image_back_key: row.image_back_key,
            },
          });
        }
        await tx.goDriverVehiclePhoto.deleteMany({ where: { driver_id: driverId } });
        for (const row of photoRows) {
          await tx.goDriverVehiclePhoto.create({
            data: { driver_id: driverId, ...row },
          });
        }
      });

      for (const doc of existingDocs) {
        if (doc.image_key && !savedDocs.includes(doc.image_key)) await this.documents.remove(doc.image_key);
        if (doc.image_back_key && !savedDocs.includes(doc.image_back_key)) {
          await this.documents.remove(doc.image_back_key);
        }
      }
      for (const photo of existingPhotos) {
        await this.vehiclePhotos.remove(photo.image_key);
      }

      await this.audit.log({
        actor,
        action: 'driver.vehicle_onboarding_attached',
        entity_type: 'go_driver_profile',
        entity_id: driverId,
        metadata: {
          documents: documentRows.map((row) => row.type),
          vehicle_photos: photoRows.length,
        },
      });
    } catch (error) {
      for (const key of savedDocs) await this.documents.remove(key);
      for (const key of savedPhotos) await this.vehiclePhotos.remove(key);
      throw error;
    }
  }

  private prepareVehiclePhotos(photos: string[]) {
    if (photos.length < 2 || photos.length > 6) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Between 2 and 6 vehicle photos are required');
    }
    return photos.map((raw) => this.decodeImage(raw));
  }

  /** Ticket §3 — FEMALE_DRIVER is driver gender, never a vehicle capability. */
  private assertVehicleCapabilities(caps?: GoRideRequirementType[]) {
    if (!caps?.length) return [] as GoRideRequirementType[];
    if (caps.includes(GoRideRequirementType.FEMALE_DRIVER)) {
      throw new GoException(
        GoErrorCode.VALIDATION_ERROR,
        'FEMALE_DRIVER depends on driver profile gender, not vehicle capability',
      );
    }
    return caps;
  }

  /** Mother tongue first, then additional languages — unique ISO codes. */
  private mergeSpokenLanguages(motherTongue: string, additional?: string[]) {
    return [...new Set([motherTongue, ...(additional ?? [])])];
  }

  private prepareDocuments(documents: DriverDocumentInput[], required: GoDocumentType[]) {
    const types = new Set(documents.map((doc) => doc.type));
    if (types.size !== required.length || required.some((type) => !types.has(type))) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'All required driver documents must be provided');
    }
    return documents.map((doc) => {
      if (!doc.image) {
        throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Front document image is required');
      }
      return {
        type: doc.type,
        expires_at: this.expiryFor(doc.type, doc.expires_at, null),
        front: this.decodeImage(doc.image),
        back: doc.image_back ? this.decodeImage(doc.image_back) : null,
      };
    });
  }

  private expiryFor(type: GoDocumentType, incoming: Date | null | undefined, current: Date | null) {
    if (!EXPIRING_DOCUMENTS.has(type)) return null;
    const expires = incoming === undefined ? current : incoming;
    if (!expires) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Expiry is required for this document');
    return expires;
  }

  private validFromExpiry(expires: Date | null) {
    if (!expires) return true;
    const day = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return day.getTime() >= today.getTime();
  }

  private decodeImage(raw: string) {
    const trimmed = raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s/g, '');
    const data = Buffer.from(trimmed, 'base64');
    if (!data.length || data.length > 3_000_000) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Document image is too large');
    }
    const image = sniffImage(data);
    if (!image) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Document image must be a JPEG, PNG, or WebP');
    return { data, image };
  }
}

function sniffImage(data: Buffer): StoredImage | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (data.length >= 8 && data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function mimeOf(key: string) {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
