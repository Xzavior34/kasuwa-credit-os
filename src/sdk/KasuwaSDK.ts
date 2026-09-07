// src/sdk/KasuwaSDK.ts - Kasuwa Credit OS Composable Client SDK
import { Contract, Provider, Signer, getAddress, isAddress } from "ethers";

export interface KasuwaConfig {
  passportAddress: string;
  verifierAddress?: string;
  creditLineAddress?: string;
  chainId?: number;
}

export interface MerchantCreditProfile {
  merchantIdHex: string;
  tier: number;
  tierName: string;
  verifiedEventCount: number;
  verifiedPaymentVolumeUSD: number;
  successfulRepayments: number;
  repaymentStreakMonths: number;
  missedObligations: number;
  activeExposureUSD: number;
  currentCapacityUSD: number;
  availableCreditUSD: number;
}

const PASSPORT_ABI = [
  "function getCreditCapacity(bytes32 merchantId) external view returns (uint256)",
  "function getCreditTier(bytes32 merchantId) external view returns (uint8)",
  "function getCurrentExposure(bytes32 merchantId) external view returns (uint256)",
  "function getAvailableCredit(bytes32 merchantId) external view returns (uint256)",
  "function getVerifiedEconomicActivity(bytes32 merchantId) external view returns (uint256 eventCount, uint256 paymentVolume)",
  "function getRepaymentHistory(bytes32 merchantId) external view returns (uint256 count, uint256 volume, uint256 streak, uint256 missed)",
  "function getMerchantState(bytes32 merchantId) external view returns (tuple(uint256 verifiedEventCount, uint256 verifiedPaymentVolume, uint256 successfulRepaymentCount, uint256 repaymentVolume, uint256 repaymentStreak, uint256 missedObligations, uint64 lastVerifiedActivity, uint256 currentExposure, uint256 currentCapacity))"
];

/**
 * KasuwaClient: The programmatic developer interface for the Kasuwa Credit OS.
 * Enables any B2B platform, fintech, or lending protocol on Creditcoin to query
 * verifiable credit capacity derived from cross-chain economic turnover.
 */
export class KasuwaClient {
  private passportContract: Contract;

  constructor(
    private runner: Provider | Signer,
    private config: KasuwaConfig
  ) {
    this.passportContract = new Contract(config.passportAddress, PASSPORT_ABI, runner);
  }

  /**
   * Helper to normalize a merchant address or string into bytes32
   */
  public toMerchantId(merchantIdentifier: string): string {
    if (merchantIdentifier.startsWith("0x") && merchantIdentifier.length === 66) {
      return merchantIdentifier;
    }
    if (isAddress(merchantIdentifier)) {
      return "0x" + "00".repeat(12) + getAddress(merchantIdentifier).slice(2).toLowerCase();
    }
    const hex = Buffer.from(merchantIdentifier, "utf8").toString("hex");
    return "0x" + hex.padEnd(64, "0");
  }

  /**
   * Query the complete verified credit profile of any merchant on Creditcoin CC3
   */
  public async getMerchantProfile(merchantIdentifier: string): Promise<MerchantCreditProfile> {
    const merchantId = this.toMerchantId(merchantIdentifier);
    const [state, tier, available] = await Promise.all([
      this.passportContract.getMerchantState(merchantId),
      this.passportContract.getCreditTier(merchantId),
      this.passportContract.getAvailableCredit(merchantId),
    ]);

    const tierNames = [
      "Unrated",
      "Tier 1 (Emerging)",
      "Tier 2 (Standard)",
      "Tier 3 (Prime)",
      "Tier 4 (Premier)",
      "Tier 5 (Institutional)"
    ];

    const tierNum = Number(tier);

    return {
      merchantIdHex: merchantId,
      tier: tierNum,
      tierName: tierNames[tierNum] || `Tier ${tierNum}`,
      verifiedEventCount: Number(state.verifiedEventCount),
      verifiedPaymentVolumeUSD: Number(state.verifiedPaymentVolume),
      successfulRepayments: Number(state.successfulRepaymentCount),
      repaymentStreakMonths: Number(state.repaymentStreak),
      missedObligations: Number(state.missedObligations),
      activeExposureUSD: Number(state.currentExposure),
      currentCapacityUSD: Number(state.currentCapacity),
      availableCreditUSD: Number(available),
    };
  }

  /**
   * Fast check for unreserved available borrowing credit
   */
  public async getAvailableCredit(merchantIdentifier: string): Promise<number> {
    const merchantId = this.toMerchantId(merchantIdentifier);
    const avail = await this.passportContract.getAvailableCredit(merchantId);
    return Number(avail);
  }
}
