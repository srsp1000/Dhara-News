// frontend/lib/districts.js
// Complete India districts mapping — State → [District, ...]
// Used for State→District navigation on location pages
// Source: Census 2011 + recent state bifurcations (as of 2024)

export const INDIA_DISTRICTS = {
  "Andhra Pradesh": [
    "Visakhapatnam","Vijayawada","Guntur","Tirupati","Kurnool","Kakinada",
    "Rajahmundry","Nellore","Kadapa","Anantapur","Srikakulam","Vizianagaram",
    "Eluru","Ongole","Chittoor","Machilipatnam","Hindupur","Nandyal",
    "Bhimavaram","Tenali","Proddatur","Narasaraopet","Bapatla","Parvathipuram"
  ],
  "Arunachal Pradesh": [
    "Itanagar","Naharlagun","Pasighat","Tawang","Ziro","Bomdila","Tezu",
    "Roing","Aalo","Changlang","Daporijo","Khonsa","Anini","Yingkiong",
    "Seppa","Namsai","Longding","Tirap","Papum Pare","Lower Subansiri"
  ],
  "Assam": [
    "Guwahati","Dibrugarh","Silchar","Jorhat","Nagaon","Tinsukia","Tezpur",
    "Bongaigaon","Dhubri","Goalpara","Sivasagar","Lakhimpur","Hailakandi",
    "Karimganj","Kokrajhar","Barpeta","Nalbari","Kamrup","Sonitpur",
    "Morigaon","Golaghat","Biswanath","Charaideo","Hojai","South Salmara"
  ],
  "Bihar": [
    "Patna","Gaya","Bhagalpur","Muzaffarpur","Purnia","Darbhanga","Bihar Sharif",
    "Arrah","Begusarai","Katihar","Munger","Chhapra","Hajipur","Sasaram",
    "Dehri","Siwan","Motihari","Nawada","Bettiah","Saharsa","Supaul",
    "Madhepura","Sitamarhi","Kishanganj","Araria","Buxar","Jehanabad",
    "Lakhisarai","Sheikhpura","Sheohar","Vaishali","Gopalganj","Saran"
  ],
  "Chhattisgarh": [
    "Raipur","Bhilai","Korba","Bilaspur","Durg","Rajnandgaon","Jagdalpur",
    "Ambikapur","Raigarh","Dhamtari","Mahasamund","Kabirdham","Kanker",
    "Kondagaon","Sukma","Bijapur","Narayanpur","Baster","Janjgir-Champa",
    "Surguja","Balod","Baloda Bazar","Gariaband","Mungeli","Balrampur"
  ],
  "Delhi": [
    "Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi",
    "North West Delhi","Shahdara","South Delhi","South East Delhi",
    "South West Delhi","West Delhi"
  ],
  "Goa": [
    "North Goa","South Goa"
  ],
  "Gujarat": [
    "Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Gandhinagar",
    "Junagadh","Anand","Amreli","Bharuch","Mehsana","Patan","Banaskantha",
    "Sabarkantha","Kheda","Nadiad","Surendranagar","Morbi","Botad","Aravalli",
    "Chhota Udaipur","Dahod","Devbhumi Dwarka","Gir Somnath","Kutch",
    "Mahisagar","Narmada","Navsari","Porbandar","Tapi","Valsad"
  ],
  "Haryana": [
    "Gurugram","Faridabad","Panipat","Ambala","Yamunanagar","Rohtak","Hisar",
    "Karnal","Sonipat","Panchkula","Bhiwani","Sirsa","Jind","Kaithal",
    "Rewari","Mahendragarh","Palwal","Mewat","Kurukshetra","Fatehabad",
    "Charkhi Dadri","Nuh"
  ],
  "Himachal Pradesh": [
    "Shimla","Dharamshala","Mandi","Solan","Kangra","Kullu","Hamirpur",
    "Una","Bilaspur","Chamba","Kinnaur","Lahaul and Spiti","Sirmaur"
  ],
  "Jharkhand": [
    "Ranchi","Dhanbad","Jamshedpur","Bokaro","Deoghar","Hazaribagh","Giridih",
    "Ramgarh","Dumka","Palamu","Chatra","Gumla","Lohardaga","Simdega",
    "West Singhbhum","East Singhbhum","Seraikela Kharsawan","Saraikela",
    "Koderma","Godda","Sahibganj","Pakur","Jamtara","Khunti"
  ],
  "Karnataka": [
    "Bengaluru","Mysuru","Hubballi","Mangaluru","Kalaburagi","Belagavi",
    "Davanagere","Ballari","Vijayapura","Shivamogga","Tumakuru","Raichur",
    "Bidar","Hassan","Udupi","Chikkamagaluru","Haveri","Dharwad",
    "Chitradurga","Kolar","Mandya","Kodagu","Gadag","Yadgir",
    "Chamarajanagar","Bagalkot","Koppal","Chikkaballapur","Ramanagara","Bengaluru Rural"
  ],
  "Kerala": [
    "Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Malappuram",
    "Palakkad","Alappuzha","Kannur","Kottayam","Ernakulam","Idukki",
    "Wayanad","Kasaragod","Pathanamthitta"
  ],
  "Madhya Pradesh": [
    "Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna",
    "Ratlam","Rewa","Murwara","Singrauli","Burhanpur","Khandwa","Bhind",
    "Chhindwara","Guna","Shivpuri","Vidisha","Chhatarpur","Damoh","Mandsaur",
    "Khargone","Neemuch","Pithampur","Narmadapuram","Itarsi","Seoni","Sehore",
    "Hoshangabad","Dhar","Morena","Datia","Balaghat","Barwani","Betul",
    "Dindori","Harda","Jhabua","Katni","Mandla","Narsinghpur","Raisen",
    "Rajgarh","Shahdol","Shajapur","Sheopur","Sidhi","Tikamgarh","Umaria"
  ],
  "Maharashtra": [
    "Mumbai","Pune","Nagpur","Thane","Nashik","Aurangabad","Solapur",
    "Kolhapur","Amravati","Navi Mumbai","Sangli","Latur","Dhule","Jalgaon",
    "Ahmednagar","Akola","Chandrapur","Gondia","Nanded","Osmanabad",
    "Palghar","Parbhani","Raigad","Ratnagiri","Satara","Sindhudurg",
    "Wardha","Washim","Yavatmal","Buldhana","Hingoli","Jalna","Beed",
    "Bhandara","Gadchiroli","Nandurbar"
  ],
  "Manipur": [
    "Imphal","Bishnupur","Thoubal","Churachandpur","Senapati","Ukhrul",
    "Tamenglong","Chandel","Jiribam","Kakching","Kangpokpi","Noney",
    "Pherzawl","Tengnoupal","Kamjong","Moreh"
  ],
  "Meghalaya": [
    "Shillong","Tura","Jowai","Nongstoin","Baghmara","Resubelpara",
    "Mairang","East Khasi Hills","West Khasi Hills","Ri Bhoi","East Jaintia Hills",
    "West Jaintia Hills","East Garo Hills","West Garo Hills","South Garo Hills",
    "South West Garo Hills","Eastern West Khasi Hills"
  ],
  "Mizoram": [
    "Aizawl","Lunglei","Champhai","Kolasib","Serchhip","Lawngtlai",
    "Mamit","Siaha","Saitual","Khawzawl","Hnahthial"
  ],
  "Nagaland": [
    "Kohima","Dimapur","Mokokchung","Tuensang","Wokha","Zunheboto","Mon",
    "Phek","Peren","Longleng","Kiphire","Noklak","Tseminyu","Shamator",
    "Chumoukedima","Niuland"
  ],
  "Odisha": [
    "Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri",
    "Balasore","Bhadrak","Baripada","Jharsuguda","Bolangir","Koraput",
    "Kendujhar","Dhenkanal","Bargarh","Sundargarh","Rayagada","Angul",
    "Nayagarh","Ganjam","Malkangiri","Nabarangpur","Nuapada","Sonepur",
    "Baudh","Boudh","Deogarh","Gajapati","Jagatsinghpur","Jajpur",
    "Kandhamal","Kendrapara","Khordha","Mayurbhanj"
  ],
  "Punjab": [
    "Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali",
    "Firozpur","Hoshiarpur","Gurdaspur","Sangrur","Fatehgarh Sahib",
    "Pathankot","Moga","Muktsar","Faridkot","Rupnagar","Nawanshahr",
    "Kapurthala","Tarn Taran","Barnala","Fazilka","Mansa","Malerkotla"
  ],
  "Rajasthan": [
    "Jaipur","Jodhpur","Udaipur","Ajmer","Kota","Bikaner","Alwar","Bharatpur",
    "Sikar","Pali","Sri Ganganagar","Chittorgarh","Tonk","Barmer","Bhilwara",
    "Dholpur","Dungarpur","Hanumangarh","Jhalawar","Jhunjhunu","Karauli",
    "Nagaur","Pratapgarh","Rajsamand","Sawai Madhopur","Sirohi","Baran",
    "Bundi","Churu","Dausa","Jaisalmer","Jalore","Sriganganagar",
    "Banswara","Balotra","Beawar","Didwana","Dudu","Gangapur City",
    "Jodhpur Rural","Kekri","Kotputli","Neem Ka Thana","Phalodi",
    "Salumbar","Sanchore","Shahpura","Anupgarh"
  ],
  "Sikkim": [
    "Gangtok","Namchi","Gyalshing","Mangan","Soreng","Pakyong"
  ],
  "Tamil Nadu": [
    "Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli",
    "Vellore","Erode","Thoothukudi","Tiruppur","Kancheepuram","Thanjavur",
    "Dindigul","Dharmapuri","Cuddalore","Villupuram","Nagapattinam","Sivaganga",
    "Virudhunagar","Theni","Namakkal","Krishnagiri","Ariyalur","Perambalur",
    "Pudukottai","Ramanathapuram","Tiruvannamalai","Tiruvarur","Vellore",
    "Ranipet","Tenkasi","Chengalpattu","Kallakurichi","Mayiladuthurai","Nilgiris",
    "Tirupathur","Kanyakumari","Karur"
  ],
  "Telangana": [
    "Hyderabad","Warangal","Karimnagar","Nizamabad","Khammam","Ramagundam",
    "Mahbubnagar","Nalgonda","Adilabad","Suryapet","Mancherial","Jagtial",
    "Peddapalli","Bhadradri Kothagudem","Yadadri Bhuvanagiri","Medak",
    "Sangareddy","Siddipet","Rajanna Sircilla","Jangaon","Bhupalpally",
    "Mulugu","Mahabubabad","Wanaparthy","Jogulamba Gadwal","Nagarkurnool",
    "Narayanpet","Vikarabad","Medchal","Rangareddy","Kamareddy","Nirmal","Kumuram Bheem"
  ],
  "Tripura": [
    "Agartala","Dharmanagar","Udaipur","Ambassa","Belonia","Kailasahar",
    "Dhalai","Gomati","Khowai","North Tripura","Sepahijala","Sipahijala",
    "South Tripura","Unakoti","West Tripura"
  ],
  "Uttar Pradesh": [
    "Lucknow","Agra","Varanasi","Kanpur","Allahabad","Prayagraj","Ghaziabad",
    "Meerut","Noida","Mathura","Aligarh","Bareilly","Moradabad","Gorakhpur",
    "Saharanpur","Firozabad","Jhansi","Muzaffarnagar","Lakhimpur Kheri","Rampur",
    "Shahjahanpur","Sitapur","Hapur","Etawah","Sambhal","Ayodhya","Faizabad",
    "Amroha","Mau","Rae Bareli","Jaunpur","Hardoi","Unnao","Ballia",
    "Deoria","Fatehpur","Pratapgarh","Sultanpur","Barabanki","Bijnor",
    "Badaun","Bulandshahr","Azamgarh","Budaun","Ghazipur","Baghpat",
    "Basti","Chandauli","Chitrakoot","Etah","Farrukhabad","Gautam Buddha Nagar",
    "Gonda","Hamirpur","Hathras","Jalaun","Kannauj","Kanpur Dehat",
    "Kasganj","Kaushambi","Kushinagar","Lalitpur","Mahoba","Maharajganj",
    "Mainpuri","Mirzapur","Pilibhit","Sant Kabir Nagar","Sant Ravidas Nagar",
    "Shamli","Shravasti","Siddharth Nagar","Sonbhadra"
  ],
  "Uttarakhand": [
    "Dehradun","Haridwar","Nainital","Haldwani","Roorkee","Rudrapur","Rishikesh",
    "Almora","Mussoorie","Pithoragarh","Udham Singh Nagar","Bageshwar",
    "Chamoli","Champawat","Pauri Garhwal","Rudraprayag","Tehri Garhwal","Uttarkashi"
  ],
  "West Bengal": [
    "Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda",
    "Raiganj","Kharagpur","Haldia","Darjeeling","Jalpaiguri","Cooch Behar",
    "Krishnanagar","Burdwan","Bankura","Purulia","Midnapore","Hooghly",
    "Murshidabad","Birbhum","Alipurduar","Jhargram","Kalimpong","Nadia",
    "North 24 Parganas","South 24 Parganas"
  ],
  // Union Territories
  "Jammu and Kashmir": [
    "Srinagar","Jammu","Anantnag","Baramulla","Udhampur","Sopore","Pulwama",
    "Rajouri","Kathua","Bandipore","Budgam","Doda","Ganderbal","Kishtwar",
    "Kulgam","Kupwara","Poonch","Ramban","Reasi","Shopian","Kargil"
  ],
  "Ladakh": ["Leh","Kargil"],
  "Puducherry": ["Puducherry","Karaikal","Mahe","Yanam"],
  "Chandigarh": ["Chandigarh"],
  "Andaman and Nicobar Islands": ["South Andaman","North and Middle Andaman","Nicobar"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
  "Lakshadweep": ["Kavaratti"],
};

/**
 * Given a district name, return its state. Handles ambiguous district names
 * (e.g. "Aurangabad" in both Maharashtra and Bihar) by returning the first match.
 * Pass `stateHint` for disambiguation.
 */
export function getStateForDistrict(districtName, stateHint = null) {
  const lower = districtName.toLowerCase();
  if (stateHint && INDIA_DISTRICTS[stateHint]) {
    if (INDIA_DISTRICTS[stateHint].some(d => d.toLowerCase() === lower)) {
      return stateHint;
    }
  }
  for (const [state, districts] of Object.entries(INDIA_DISTRICTS)) {
    if (districts.some(d => d.toLowerCase() === lower)) return state;
  }
  return null;
}

/**
 * Slug-safe district name: lowercase, spaces to hyphens
 */
export function districtSlug(district) {
  return district.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function districtFromSlug(slug) {
  const name = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return name;
}

// All states + major UTs with districts
export const ALL_STATES_WITH_DISTRICTS = Object.keys(INDIA_DISTRICTS);
