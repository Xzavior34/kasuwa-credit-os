# Developer API

`CreditPassport.sol` exposes a read-only layer so other Creditcoin applications can consume
Kasuwa's verified credit state without needing their own attestation pipeline:

```solidity
function getCreditCapacity(bytes32 merchantId) external view returns (uint256);
function getCreditTier(bytes32 merchantId) external view returns (uint8);
function getCurrentExposure(bytes32 merchantId) external view returns (uint256);
function getAvailableCredit(bytes32 merchantId) external view returns (uint256);
function getVerifiedEconomicActivity(bytes32 merchantId) external view returns (uint256 eventCount, uint256 paymentVolume);
function getRepaymentHistory(bytes32 merchantId) external view returns (uint256 count, uint256 volume, uint256 streak, uint256 missed);
function getMerchantState(bytes32 merchantId) external view returns (MerchantState memory);
```

`merchantId` is a `bytes32` identifier chosen by whoever registers the merchant's economic
activity (e.g. `keccak256(abi.encodePacked("merchant:", someExternalId))`) — this repo does not
prescribe a specific identity scheme beyond "stable and unique per merchant."

Credit tiers (`CreditEngine.getCreditTier`):

| Tier | Capacity range |
|---|---|
| 1 | `0` – `999` |
| 2 | `1,000` – `2,999` |
| 3 | `3,000+` (up to `MAX_CAPACITY = 5,000`) |

Why portable credit state matters more than a single loan product: a lending protocol, a
merchant-finance product, a payroll platform, and an embedded-finance app can all read the same
`CreditPassport` state for the same merchant instead of each re-deriving underwriting signal
from scratch. See `docs/CEIP_READINESS.md` (not yet written) for the fuller ecosystem argument.
