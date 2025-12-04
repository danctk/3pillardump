# Diff Analysis: old cov.json vs new cov.json

## Structure Changes

### Fields Present in OLD but Missing in NEW:
- `CarrierName`: "Transverse"
- `SublineName`: "Builders_Risk" 
- `ProductNumber`: "PL_4742_12"
- `ProductVerNumber`: "PL_4742_12_V1"
- `RateLookupDate`: "10/17/2025"
- `QuoteId`: ""
- `MarketType`: "Proprietary"
- `Lob`: "PL"
- `EndClientUserUniqueSessionId`: "1.0"
- `UserRole`: "Agent"

### Fields Present in NEW but Missing in OLD:
- `BillingType`: "DirectBill"
- `SelectedLineOfBusiness` array with:
  - `InsuranceType`: "Homeowners"
  - `LOBName`: "PL"
  - `ID`: "d9b0430c-855b-455a-9d69-f0161a483059"
  - `PARENTID`: "85c8695b-d287-4e8a-a1aa-aede48def00a"
- `TermInMonths`: "12" (in Coverage section)

## Field Value Changes

| Field | OLD Value | NEW Value | Change Type |
|-------|-----------|-----------|-------------|
| `CarrierID` | "755" | "0" | Value Changed |
| `SubLineID` | "10" | "0" | Value Changed |
| `PolicyEffectiveDate` | "10/17/2025" | "10/23/2025" | Date Changed |
| `PolicyExpirationDate` | "10/17/2026" | "10/23/2026" | Date Changed |
| `DwellingCoverage` | "1386000" | "443000" | Amount Changed |
| `RoofingSystemsLimit` | "30000" | "" | Value Changed (empty) |
| `BrowserIp` | "192.158.1.38." | "192.158.1.38" | Minor (trailing dot removed) |
| `SubmissionID` | "d97e4743-6d55-4707-a4c3-f5439507597d" | "da352d69-7b6e-4672-9c09-16d36fc2062c" | ID Changed |

## Location/Building ID Changes

| Field | OLD Value | NEW Value |
|-------|-----------|-----------|
| Location ID | "96bd811a-cb2e-4f31-94fe-f74812c47e0a" | "3f0aefb8-00e8-4712-a234-1a259d295ddd" |
| Insured ID | "f40eaa79-867a-4de5-b2e5-2c9ea4450a32" | "25d0a820-f6b5-454b-9501-90b6c797c454" |

## Coverage Section Comparison

### OLD Coverage:
```json
{
    "DwellingCoverage": "1386000",
    "WindCoverage": "Yes",
    "OtherStructureCoverage": "2",
    "PersonalPropertyCoverage": "25",
    "LossOfUseCoverage": "10",
    "PersonalLiabilityCoverageL": "100000",
    "MedicalPaymentsCoverageM": "1000",
    "PolicyformOption": "RCV",
    "RoofingSystemsLimit": "30000"
}
```

### NEW Coverage:
```json
{
    "DwellingCoverage": "443000",
    "PolicyformOption": "RCV",
    "RoofingSystemsLimit": "",
    "TermInMonths": "12",
    "WindCoverage": "Yes",
    "OtherStructureCoverage": "2",
    "PersonalPropertyCoverage": "25",
    "LossOfUseCoverage": "10",
    "PersonalLiabilityCoverageL": "100000",
    "MedicalPaymentsCoverageM": "1000"
}
```

## Summary of Key Changes:

1. **Reduced Dwelling Coverage**: From $1,386,000 to $443,000
2. **Policy Dates**: Moved from October 17th to October 23rd
3. **Carrier Changes**: From Transverse (ID: 755) to Unknown (ID: 0)
4. **Product Information**: Removed specific product numbers and versions
5. **Added Billing Type**: Now includes "DirectBill"
6. **Added Line of Business Details**: New SelectedLineOfBusiness section
7. **Roofing Systems Limit**: Changed from $30,000 to empty
8. **Added Term**: New "TermInMonths" field set to "12"

## Token Changes:
Both files have different tokens (truncated in display), indicating different session/request contexts.


