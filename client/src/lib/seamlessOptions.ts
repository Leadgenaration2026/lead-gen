// Shared, fixed value lists Seamless.AI's search API accepts -- kept as
// client-side literals (server modules can't be imported into the client
// bundle) mirroring SEAMLESS_INDUSTRY_OPTIONS in server/seamlessAI.ts and the
// same lists client/src/pages/AIAgent.tsx defines locally for its own wizard
// steps. A small duplication across three places, consistent with the
// existing pattern here (Seamless's accepted values rarely change and each
// copy is independently commented), rather than risk touching AIAgent.tsx's
// already-working local copy for this.

export const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India", "Germany",
  "France", "Singapore", "UAE", "Netherlands", "Japan", "Brazil", "South Africa",
  "New Zealand", "Ireland",
];

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];

export const COMPANY_SIZES = [
  "0 - 1 (Self-employed)", "2 - 10", "11 - 50", "51 - 200", "201 - 500",
  "501 - 1,000", "1,001 - 5,000", "5,001 - 10,000", "10,001+",
];

export const INDUSTRY_OPTIONS = [
  "Aerospace & Defense", "Airlines & Aviation", "Aviation & Aerospace", "Defense & Space", "Military",
  "Agriculture", "Farming", "Horticulture", "Ranching", "Tobacco",
  "Apparel & Fashion", "Textiles",
  "Automotive",
  "Chemicals & Materials", "Chemicals", "Plastics",
  "Consumer Goods & Retail", "Consumer Goods", "Luxury Goods & Jewelry", "Retail", "Sporting Goods",
  "Education & Training", "E-Learning", "Education Management", "Higher Education", "Libraries", "Primary/Secondary Education",
  "Electronics & Hardware", "Computer Hardware", "Consumer Electronics", "Electrical & Electronic Manufacturing", "Semiconductors",
  "Energy & Utilities", "Oil & Energy", "Utilities",
  "Entertainment", "Animation", "Arts & Crafts", "Computer Games", "Fine Art", "Gambling & Casinos", "Mobile Games", "Motion Pictures & Film", "Music", "Performing Arts", "Photography", "Recreational Facilities & Services", "Sports",
  "Environmental", "Environmental Services", "Renewables & Environment",
  "Finance & Banking", "Banking", "Capital Markets", "Financial Services", "Investment Banking", "Investment Management", "Venture Capital & Private Equity",
  "Food & Beverage", "Dairy", "Fishery", "Food & Beverages", "Food Production", "Restaurants", "Supermarkets", "Wine & Spirits",
  "Government & Public Policy", "Executive Office", "Government Administration", "Government Relations", "Judiciary", "Law Enforcement", "Legislative Office", "Political Organization", "Public Policy", "Public Safety",
  "Health & Wellness", "Alternative Medicine", "Health, Wellness and Fitness", "Hospital & Health Care", "Medical Practice", "Mental Health Care", "Veterinary",
  "Hospitality & Tourism", "Events Services", "Hospitality", "Leisure, Travel & Tourism", "Museums & Institutions",
  "Household, Personal, & Beauty", "Consumer Services", "Cosmetics", "Furniture", "Individual & Family Services",
  "Insurance",
  "Internet & E-Commerce", "Internet",
  "Manufacturing & Engineering", "Civil Engineering", "Industrial Automation", "Machinery", "Mechanical or Industrial Engineering", "Railroad Manufacture", "Shipbuilding",
  "Marketing & Media", "Broadcast Media", "Graphic Design", "Marketing & Advertising", "Media Production", "Newspapers", "Online Media", "Printing", "Public Relations & Communications", "Publishing", "Writing & Editing",
  "Metals, Mining & Materials", "Building Materials", "Glass, Ceramics & Concrete", "Mining & Metals", "Paper & Forest Products",
  "Non-Profit", "Fund-Raising", "Non-Profit Organization Management", "Philanthropy", "Religious Institutions",
  "Pharmaceuticals & Medical Devices", "Biotechnology", "Medical Devices", "Nanotechnology", "Pharmaceuticals",
  "Professional Services & Consulting", "Accounting", "Alternative Dispute Resolution", "Civic & Social Organization", "Design", "Human Resources", "International Affairs", "International Trade & Development", "Law Practice", "Legal Services", "Management Consulting", "Market Research", "Outsourcing/Offshoring", "Professional Training & Coaching", "Program Development", "Research", "Security & Investigations", "Staffing & Recruiting", "Think Tanks",
  "Real Estate & Construction", "Architecture & Planning", "Commercial Real Estate", "Construction", "Facilities Services", "Real Estate",
  "Software & Information Technology", "Computer & Network Security", "Computer Software", "Information Services", "Information Technology & Services", "Software Development",
  "Telecommunications & Networking", "Computer Networking", "Telecommunications", "Wireless",
  "Transportation & Logistics", "Logistics & Supply Chain", "Maritime", "Package/Freight Delivery", "Packaging & Containers", "Translation & Localization", "Transportation/Trucking/Railroad",
  "Wholesale & Distribution", "Business Supplies & Equipment", "Import & Export", "Warehousing", "Wholesale",
];

// Common job titles covering the groups in server/titleExpansionMap.ts --
// picking from this list is passed as titlesOverride, so Seamless matches on
// these exact titles instead of leaving title extraction to the free-text
// parser.
export const JOB_TITLE_OPTIONS = [
  "Owner", "Founder", "CEO", "President", "COO", "CFO", "CTO", "CMO",
  "VP of Sales", "Sales Manager", "VP of Marketing", "Marketing Manager",
  "VP of Engineering", "Engineering Manager", "IT Director", "HR Director",
  "Operations Manager", "General Manager", "Director", "Manager",
  "Business Development Manager", "Account Executive",
];

export const STYLE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "clean_professional", label: "Clean & Professional", description: "Restrained palette, lots of white space, trustworthy tone" },
  { value: "premium_modern", label: "Premium & Modern", description: "Bolder palette, confident and polished tone" },
  { value: "bold_conversion", label: "Bold & Conversion-Focused", description: "High-contrast, punchy copy, unmissable CTA" },
];

// Mirrors FONT_FAMILIES in server/_core/campaignGenerator.ts -- values must
// match exactly since the server validates a saved fontFamily against that
// same whitelist (normalizeTheme/mergeTheme). "system" keeps the original
// hardcoded stack with no Google Fonts request at all.
export const FONT_OPTIONS: Array<{ value: string; label: string; cssFamily: string }> = [
  { value: "system", label: "System Default", cssFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif` },
  { value: "inter", label: "Inter", cssFamily: `"Inter", sans-serif` },
  { value: "roboto", label: "Roboto", cssFamily: `"Roboto", sans-serif` },
  { value: "open_sans", label: "Open Sans", cssFamily: `"Open Sans", sans-serif` },
  { value: "poppins", label: "Poppins", cssFamily: `"Poppins", sans-serif` },
  { value: "montserrat", label: "Montserrat", cssFamily: `"Montserrat", sans-serif` },
  { value: "lato", label: "Lato", cssFamily: `"Lato", sans-serif` },
  { value: "playfair", label: "Playfair Display", cssFamily: `"Playfair Display", serif` },
  { value: "merriweather", label: "Merriweather", cssFamily: `"Merriweather", serif` },
];

export const SOCIAL_PLATFORM_OPTIONS = ["facebook", "twitter", "linkedin", "instagram", "youtube", "tiktok"] as const;
export const SOCIAL_PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook", twitter: "Twitter / X", linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok",
};
