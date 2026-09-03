// frontend/lib/gov_sources.js
// Authoritative mapping of Indian government source domains
// Used by the Government portal and Parliament/Court tracker

// ─── Central Government Domains ───────────────────────────────────────────────

export const ALL_CENTRAL_GOV_DOMAINS = [
  // Parliamentary sources
  "pib.gov.in", "sansad.in", "loksabha.nic.in", "rajyasabha.nic.in", "prsindia.org",
  // Judiciary
  "sci.gov.in", "doj.gov.in",
  // Core ministries
  "mea.gov.in",           // External Affairs
  "mha.gov.in",           // Home Affairs
  "mod.gov.in",           // Defence
  "finmin.nic.in",        // Finance
  "mohfw.gov.in",         // Health
  "education.gov.in", "mhrd.gov.in", // Education
  "agricoop.nic.in",      // Agriculture
  "moef.gov.in",          // Environment
  "dst.gov.in",           // Science & Technology
  "meity.gov.in",         // Electronics & IT
  "indianrailways.gov.in",// Railways
  "dot.gov.in",           // Telecom
  "msme.gov.in",          // MSME
  "doj.gov.in",           // Law & Justice
  // Regulatory / autonomous bodies
  "rbi.org.in", "sebi.gov.in", "irdai.gov.in", "trai.gov.in",
  "isro.gov.in", "icmr.nic.in", "ugc.ac.in", "nha.gov.in",
  "nabard.org", "nhb.org.in", "uidai.gov.in",
  "eci.gov.in",           // Election Commission
  "cag.gov.in",           // CAG
  "niti.gov.in",          // NITI Aayog
  "mygov.in",             // MyGov
  "india.gov.in",         // NIC portal
  "nhrc.nic.in",          // NHRC
];

// ─── Ministry Categories ───────────────────────────────────────────────────────

export const MINISTRY_CATEGORIES = [
  {
    key:     "all",
    label:   "All Ministries",
    icon:    "🏛️",
    domains: ALL_CENTRAL_GOV_DOMAINS,
  },
  {
    key:     "parliament",
    label:   "Parliament",
    icon:    "📜",
    domains: ["sansad.in", "loksabha.nic.in", "rajyasabha.nic.in", "prsindia.org", "pib.gov.in"],
  },
  {
    key:     "finance",
    label:   "Finance & Economy",
    icon:    "💰",
    domains: ["finmin.nic.in", "rbi.org.in", "sebi.gov.in", "nabard.org", "nhb.org.in", "irdai.gov.in"],
  },
  {
    key:     "home",
    label:   "Home Affairs",
    icon:    "🏠",
    domains: ["mha.gov.in"],
  },
  {
    key:     "defence",
    label:   "Defence",
    icon:    "🛡️",
    domains: ["mod.gov.in"],
  },
  {
    key:     "health",
    label:   "Health",
    icon:    "🏥",
    domains: ["mohfw.gov.in", "icmr.nic.in", "nha.gov.in"],
  },
  {
    key:     "education",
    label:   "Education",
    icon:    "📚",
    domains: ["education.gov.in", "mhrd.gov.in", "ugc.ac.in"],
  },
  {
    key:     "external",
    label:   "External Affairs",
    icon:    "🌍",
    domains: ["mea.gov.in"],
  },
  {
    key:     "agriculture",
    label:   "Agriculture",
    icon:    "🌾",
    domains: ["agricoop.nic.in", "icar.org.in", "nabard.org"],
  },
  {
    key:     "science",
    label:   "Science & Tech",
    icon:    "🔬",
    domains: ["dst.gov.in", "isro.gov.in", "dbt.nic.in", "meity.gov.in"],
  },
  {
    key:     "environment",
    label:   "Environment",
    icon:    "🌿",
    domains: ["moef.gov.in", "cpcb.nic.in"],
  },
  {
    key:     "judiciary",
    label:   "Judiciary",
    icon:    "⚖️",
    domains: ["sci.gov.in", "doj.gov.in"],
  },
  {
    key:     "railways",
    label:   "Railways",
    icon:    "🚂",
    domains: ["indianrailways.gov.in"],
  },
  {
    key:     "elections",
    label:   "Elections (ECI)",
    icon:    "🗳️",
    domains: ["eci.gov.in"],
  },
];

// ─── State Government Domains ─────────────────────────────────────────────────

export const STATE_GOV_DOMAINS = {
  "Andhra Pradesh":         ["apinformation.gov.in", "ap.gov.in"],
  "Arunachal Pradesh":      ["arunachalpradesh.gov.in"],
  "Assam":                  ["assam.gov.in"],
  "Bihar":                  ["state.bihar.gov.in"],
  "Chhattisgarh":           ["chhattisgarh.gov.in", "cginfo.nic.in"],
  "Delhi":                  ["delhi.gov.in", "dipr.delhigovt.nic.in"],
  "Goa":                    ["goa.gov.in"],
  "Gujarat":                ["gujaratinformation.gov.in", "gujarat.gov.in"],
  "Haryana":                ["haryana.gov.in"],
  "Himachal Pradesh":       ["hpinfo.nic.in", "himachal.nic.in"],
  "Jharkhand":              ["jharkhand.gov.in"],
  "Karnataka":              ["karnataka.gov.in"],
  "Kerala":                 ["kerala.gov.in", "prd.kerala.gov.in"],
  "Madhya Pradesh":         ["mp.gov.in", "mpinfo.org"],
  "Maharashtra":            ["maharashtra.gov.in", "mahainfo.gov.in"],
  "Manipur":                ["manipur.gov.in"],
  "Meghalaya":              ["meghalaya.gov.in"],
  "Mizoram":                ["mizoram.gov.in"],
  "Nagaland":               ["nagaland.gov.in"],
  "Odisha":                 ["odisha.gov.in"],
  "Punjab":                 ["punjab.gov.in"],
  "Rajasthan":              ["rajasthan.gov.in", "dipr.rajasthan.gov.in"],
  "Sikkim":                 ["sikkim.gov.in"],
  "Tamil Nadu":             ["tn.gov.in", "iprtn.nic.in"],
  "Telangana":              ["telangana.gov.in", "dipr.telangana.gov.in"],
  "Tripura":                ["tripura.gov.in"],
  "Uttar Pradesh":          ["up.gov.in", "information.up.nic.in"],
  "Uttarakhand":            ["uk.gov.in"],
  "West Bengal":            ["wb.gov.in", "wbdipr.gov.in"],
  // Union Territories
  "Jammu and Kashmir":      ["jk.gov.in"],
  "Ladakh":                 ["ladakh.gov.in"],
  "Puducherry":             ["puducherry.gov.in"],
  "Chandigarh":             ["chandigarh.gov.in"],
  "Andaman and Nicobar Islands": ["and.nic.in"],
  "Dadra and Nagar Haveli and Daman and Diu": ["dnh.nic.in", "daman.nic.in"],
  "Lakshadweep":            ["lakshadweep.gov.in"],
};

// All state gov domains combined (for "all states" queries)
export const ALL_STATE_GOV_DOMAINS = Object.values(STATE_GOV_DOMAINS).flat();

// ─── States and UTs Display List ─────────────────────────────────────────────

export const STATES_LIST = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal",
];

export const UTS_LIST = [
  "Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi",
  "Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

// PIB regional bureaus → state mapping
export const PIB_REGIONS = {
  "Mumbai":      "Maharashtra",
  "Chennai":     "Tamil Nadu",
  "Kolkata":     "West Bengal",
  "Bhopal":      "Madhya Pradesh",
  "Chandigarh":  "Punjab",
  "Hyderabad":   "Telangana",
  "Bengaluru":   "Karnataka",
  "Lucknow":     "Uttar Pradesh",
  "Guwahati":    "Assam",
  "Thiruvananthapuram": "Kerala",
  "Bhubaneswar": "Odisha",
  "Ahmedabad":   "Gujarat",
  "Patna":       "Bihar",
};
