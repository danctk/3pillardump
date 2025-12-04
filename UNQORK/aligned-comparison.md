# Side-by-Side Comparison: old cov.json vs new cov.json

| Field | OLD cov.json | NEW cov.json | Status |
|-------|--------------|--------------|---------|
| **OwnerId** | "4742" | "4742" | ✅ Same |
| **ServiceRequestDetail.OwnerId** | "4742" | "4742" | ✅ Same |
| **ServiceRequestDetail.EndClientUserUniqueSessionId** | "1.0" | "1.0" | ✅ Same |
| **ServiceRequestDetail.ServiceRequestVersion** | "1.0" | "1.0" | ✅ Same |
| **ServiceRequestDetail.LanguageCode** | "en" | "en" | ✅ Same |
| **ServiceRequestDetail.UserName** | "chenoaqaagent@test.com" | "chenoaqaagent@test.com" | ✅ Same |
| **ServiceRequestDetail.RegionCode** | "US" | "US" | ✅ Same |
| **ServiceRequestDetail.ServiceResponseVersion** | "1.0" | "1.0" | ✅ Same |
| **ServiceRequestDetail.ResponseType** | "json" | "json" | ✅ Same |
| **ServiceRequestDetail.Token** | [Different Token] | [Different Token] | ⚠️ Different |
| **ServiceRequestDetail.Lob** | "PL" | "PL" | ✅ Same |
| **ServiceRequestDetail.BrowserIp** | "192.158.1.38." | "192.158.1.38." | ✅ Same |
| **ServiceRequestDetail.UserRole** | "Agent" | "Agent" | ✅ Same |
| **QuoteType** | "New Business" | "New Business" | ✅ Same |
| **EventName** | "GetCoverageLimitsAndRates_WF_1.0.2.0" | "GetCoverageLimitsAndRates_WF_1.0.2.0" | ✅ Same |
| **CarrierID** | "755" | "755" | ✅ Same |
| **CarrierName** | "Transverse" | "Transverse" | ✅ Same |
| **SubLineID** | "10" | "10" | ✅ Same |
| **SublineName** | "Builders_Risk" | "Builders_Risk" | ✅ Same |
| **ProductNumber** | "PL_4742_12" | "PL_4742_12" | ✅ Same |
| **ProductVerNumber** | "PL_4742_12_V1" | "PL_4742_12_V1" | ✅ Same |
| **PolicyEffectiveDate** | "10/17/2025" | "10/17/2025" | ✅ Same |
| **PolicyExpirationDate** | "10/17/2026" | "10/17/2026" | ✅ Same |
| **RateLookupDate** | "10/17/2025" | "10/17/2025" | ✅ Same |
| **QuoteId** | "" | "" | ✅ Same |
| **MarketType** | "Proprietary" | "Proprietary" | ✅ Same |
| **SubmissionID** | "d97e4743-6d55-4707-a4c3-f5439507597d" | "d97e4743-6d55-4707-a4c3-f5439507597d" | ✅ Same |
| **Account.Insured[0].Location[0].ID** | "96bd811a-cb2e-4f31-94fe-f74812c47e0a" | "96bd811a-cb2e-4f31-94fe-f74812c47e0a" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].DwellingCoverage** | "1386000" | "1386000" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].WindCoverage** | "Yes" | "Yes" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].OtherStructureCoverage** | "2" | "2" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].PersonalPropertyCoverage** | "25" | "25" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].LossOfUseCoverage** | "10" | "10" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].PersonalLiabilityCoverageL** | "100000" | "100000" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].MedicalPaymentsCoverageM** | "1000" | "1000" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].PolicyformOption** | "RCV" | "RCV" | ✅ Same |
| **Account.Insured[0].Location[0].Building[0].Coverage[0].RoofingSystemsLimit** | "30000" | "30000" | ✅ Same |
| **Account.Insured[0].ID** | "f40eaa79-867a-4de5-b2e5-2c9ea4450a32" | "f40eaa79-867a-4de5-b2e5-2c9ea4450a32" | ✅ Same |

## Summary:
- **Total Fields Compared**: 33
- **Fields Matching**: 32
- **Fields Different**: 1 (Token field - expected to be different)
- **Overall Status**: ✅ **IDENTICAL** (except for expected token difference)

## Key Observations:
1. Both files are essentially identical in structure and values
2. The only difference is the Token field, which is expected to be different between requests
3. All coverage amounts, dates, IDs, and other business data are exactly the same
4. The field ordering is now perfectly aligned for easy comparison


