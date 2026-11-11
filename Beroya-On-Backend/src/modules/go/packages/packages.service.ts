import { Injectable } from '@nestjs/common';
import { GoPackage, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { passportIconMime } from '../passport/passport-icon.storage';
import { decimalToNumber } from '../pricing/fare.calculator';
import type { CreatePackageDto, UpdatePackageDto } from './dto/packages.dto';
import { PackageImageStorage, packageImageUrl } from './package-image.storage';

function publicView(pkg: GoPackage) {
  return {
    id: pkg.id,
    name_ar: pkg.name_ar,
    name_en: pkg.name_en,
    description_ar: pkg.description_ar,
    description_en: pkg.description_en,
    price: decimalToNumber(pkg.price),
    currency: pkg.currency,
    duration_days: pkg.duration_days,
    ride_count: pkg.ride_count,
    discount_percentage: pkg.discount_percentage ? decimalToNumber(pkg.discount_percentage) : null,
    image_url: packageImageUrl(pkg),
    sort_order: pkg.sort_order,
  };
}

function adminView(pkg: GoPackage) {
  return { ...publicView(pkg), is_active: pkg.is_active, created_at: pkg.created_at, updated_at: pkg.updated_at };
}

function assertHasBenefit(rideCount: number | null | undefined, discount: unknown) {
  if (rideCount == null && discount == null) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'A package needs ride_count, discount_percentage, or both');
  }
}

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: PackageImageStorage,
  ) {}

  async listPublic() {
    const rows = await this.prisma.goPackage.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map(publicView);
  }

  async listAdmin() {
    const rows = await this.prisma.goPackage.findMany({ orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] });
    return rows.map(adminView);
  }

  async get(id: string) {
    return adminView(await this.find(id));
  }

  async readImage(id: string) {
    const pkg = await this.prisma.goPackage.findUnique({ where: { id }, select: { image_key: true, is_active: true } });
    const data = pkg?.is_active && pkg.image_key ? await this.images.read(pkg.image_key) : null;
    if (!pkg?.image_key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Image not found');
    return { data, mime: passportIconMime(pkg.image_key) };
  }

  async create(user: AuthUser, dto: CreatePackageDto) {
    const { image, ...fields } = dto;
    assertHasBenefit(fields.ride_count, fields.discount_percentage);
    let pkg = await this.prisma.goPackage.create({ data: fields });
    if (image) {
      pkg = await this.prisma.goPackage.update({
        where: { id: pkg.id },
        data: { image_key: await this.images.save(pkg.id, image) },
      });
    }
    await this.audit.log({
      actor: user,
      action: 'package.created',
      entity_type: 'go_package',
      entity_id: pkg.id,
      metadata: { ...fields, image: image ? true : undefined } as Prisma.InputJsonValue,
    });
    return adminView(pkg);
  }

  async update(user: AuthUser, id: string, dto: UpdatePackageDto) {
    const current = await this.find(id);
    const { image, remove_image, ...fields } = dto;
    assertHasBenefit(
      fields.ride_count === undefined ? current.ride_count : fields.ride_count,
      fields.discount_percentage === undefined ? current.discount_percentage : fields.discount_percentage,
    );
    let image_key: string | null | undefined;
    if (image) {
      image_key = await this.images.save(id, image);
    } else if (remove_image) {
      await this.images.remove(current.image_key);
      image_key = null;
    }
    const pkg = await this.prisma.goPackage.update({ where: { id }, data: { ...fields, image_key } });
    await this.audit.log({
      actor: user,
      action: 'package.updated',
      entity_type: 'go_package',
      entity_id: id,
      metadata: { ...fields, image: image ? true : undefined, remove_image } as Prisma.InputJsonValue,
    });
    return adminView(pkg);
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.find(id);
    await this.prisma.goPackage.delete({ where: { id } });
    await this.images.remove(current.image_key);
    await this.audit.log({
      actor: user,
      action: 'package.deleted',
      entity_type: 'go_package',
      entity_id: id,
      metadata: { name_ar: current.name_ar } as Prisma.InputJsonValue,
    });
    return { success: true };
  }

  private async find(id: string) {
    const pkg = await this.prisma.goPackage.findUnique({ where: { id } });
    if (!pkg) throw new GoException(GoErrorCode.NOT_FOUND, 'Package not found');
    return pkg;
  }
}
