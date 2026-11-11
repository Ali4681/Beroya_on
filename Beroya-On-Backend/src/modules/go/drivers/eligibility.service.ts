import { Injectable } from '@nestjs/common';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import { WalletService } from '../wallets/wallet.service';

export type EligibilityReason =
  | 'ACCOUNT_SUSPENDED'
  | 'VEHICLE_INACTIVE'
  | 'DOCUMENT_EXPIRED'
  | 'DOCUMENT_MISSING'
  | 'WALLET_INSUFFICIENT'
  | 'NO_ACTIVE_VEHICLE'
  | 'OPERATIONAL_BLOCK';

/** Driver eligibility (Ticket §6.1 + §20.5). */
@Injectable()
export class DriverEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
  ) {}

  async evaluate(userId: string, opts?: { estimatedFare?: number | string | null }) {
    const profile = await this.prisma.goDriverProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: { select: { is_active: true } },
        active_vehicle: true,
        documents: true,
      },
    });
    if (!profile) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');

    const reasons: EligibilityReason[] = [];
    if (!profile.user.is_active || profile.is_suspended) reasons.push('ACCOUNT_SUSPENDED');
    if (profile.operational_blocked) reasons.push('OPERATIONAL_BLOCK');
    if (!profile.active_vehicle_id || !profile.active_vehicle) reasons.push('NO_ACTIVE_VEHICLE');
    else if (!profile.active_vehicle.is_active) reasons.push('VEHICLE_INACTIVE');

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const requiredDocs = ['LICENSE', 'VEHICLE_REGISTRATION'] as const;
    let missingDoc = false;
    let expiredDoc = false;
    for (const type of requiredDocs) {
      const doc = profile.documents.find((item) => item.type === type);
      if (!doc) {
        missingDoc = true;
        continue;
      }
      if (doc.expires_at) {
        const day = new Date(doc.expires_at.getFullYear(), doc.expires_at.getMonth(), doc.expires_at.getDate());
        if (day.getTime() < now.getTime()) expiredDoc = true;
      }
    }
    if (missingDoc) reasons.push('DOCUMENT_MISSING');
    if (expiredDoc) reasons.push('DOCUMENT_EXPIRED');

    const cover = await this.wallets.canCover(profile.id, opts?.estimatedFare);
    if (!cover.ok) reasons.push('WALLET_INSUFFICIENT');

    return {
      eligible: reasons.length === 0,
      reasons: [...new Set(reasons)],
      wallet_balance: decimalToNumber(cover.balance),
      available_balance: decimalToNumber(cover.available),
      expected_commission: decimalToNumber(cover.needed),
      outstanding_due: decimalToNumber(cover.outstanding_due),
    };
  }

  async assertEligible(userId: string, opts?: { estimatedFare?: number | string | null }) {
    const result = await this.evaluate(userId, opts);
    if (!result.eligible) {
      const code = result.reasons.includes('WALLET_INSUFFICIENT')
        ? GoErrorCode.DRIVER_WALLET_INSUFFICIENT
        : GoErrorCode.DRIVER_NOT_ELIGIBLE;
      throw new GoException(code, 'Driver is not eligible', { reasons: result.reasons });
    }
    return result;
  }
}
