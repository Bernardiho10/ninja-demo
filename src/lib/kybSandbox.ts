// Official Ninja KYB & CAC Sandbox fixtures matching backend/service/cac
// and https://www.ninja.ng/docs/

export interface SandboxCompany {
  id: number
  rc_number: string
  company_name: string
  company_type: string
  status: 'ACTIVE' | 'INACTIVE' | 'NOT_FOUND'
  registration_date: string
  registered_address: string
  city: string
  state: string
  email: string
  nature_of_business: string
  annual_returns_up_to_date: boolean
  last_annual_return_year: number | null
}

export interface SandboxDirector {
  id: number
  name: string
  role: string
  nationality: string
  address: string
  status: string
  id_type: string
  id_number: string
  shares_allotted?: number
  share_percentage?: number
  aml_flag?: boolean
}

export const SANDBOX_KYB_RCS = {
  ACTIVE: '1000001',
  INACTIVE: '2000002',
  AML_HIT: '6666666',
  NOT_FOUND: '9999999',
}

export const MOCK_COMPANIES: Record<string, { company: SandboxCompany; directors: SandboxDirector[] }> = {
  '1000001': {
    company: {
      id: 1000001,
      rc_number: 'RC-1000001',
      company_name: 'NINJA TECH LOGISTICS LIMITED',
      company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      status: 'ACTIVE',
      registration_date: '2019-04-12',
      registered_address: 'Plot 14, Commercial Avenue, Victoria Island',
      city: 'Lagos',
      state: 'Lagos State',
      email: 'operations@ninjalogistics.ng',
      nature_of_business: 'Freight forwarding, logistics and haulage services',
      annual_returns_up_to_date: true,
      last_annual_return_year: 2025,
    },
    directors: [
      {
        id: 501,
        name: 'James Babatunde Okafor',
        role: 'MANAGING_DIRECTOR',
        nationality: 'Nigerian',
        address: '12 Admiralty Way, Lekki Phase 1, Lagos',
        status: 'ACTIVE',
        id_type: 'NIN',
        id_number: '77777777777',
        shares_allotted: 600000,
        share_percentage: 60,
        aml_flag: false,
      },
      {
        id: 502,
        name: 'Fatima Amina Bello',
        role: 'DIRECTOR',
        nationality: 'Nigerian',
        address: '8 Gana Street, Maitama, Abuja',
        status: 'ACTIVE',
        id_type: 'NIN',
        id_number: '88888888888',
        shares_allotted: 400000,
        share_percentage: 40,
        aml_flag: false,
      },
    ],
  },
  '2000002': {
    company: {
      id: 2000002,
      rc_number: 'RC-2000002',
      company_name: 'PRIME AGRO ALLIED FOODS LIMITED',
      company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      status: 'INACTIVE',
      registration_date: '2014-08-20',
      registered_address: 'KM 14, Old Ibadan-Lagos Expressway',
      city: 'Ibadan',
      state: 'Oyo State',
      email: 'contact@primeallied.com.ng',
      nature_of_business: 'Wholesale agricultural processing and packaging',
      annual_returns_up_to_date: false,
      last_annual_return_year: 2017,
    },
    directors: [
      {
        id: 601,
        name: 'Sunday Emmanuel Adekunle',
        role: 'DIRECTOR',
        nationality: 'Nigerian',
        address: '4 Ring Road, Ibadan, Oyo State',
        status: 'INACTIVE',
        id_type: 'NIN',
        id_number: '33333333333',
        shares_allotted: 500000,
        share_percentage: 100,
        aml_flag: false,
      },
    ],
  },
  '6666666': {
    company: {
      id: 6666666,
      rc_number: 'RC-6666666',
      company_name: 'GLOBAL HORIZONS CAPITAL LIMITED',
      company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      status: 'ACTIVE',
      registration_date: '2021-02-10',
      registered_address: '22 Constitution Avenue, Central Business District, Abuja',
      city: 'Abuja',
      state: 'FCT',
      email: 'legal@globalhorizons.ng',
      nature_of_business: 'Financial consultancy and project management',
      annual_returns_up_to_date: true,
      last_annual_return_year: 2025,
    },
    directors: [
      {
        id: 701,
        name: 'Aliyu Ibrahim Danjuma',
        role: 'DIRECTOR',
        nationality: 'Nigerian',
        address: '34 Aso Drive, Asokoro, Abuja',
        status: 'ACTIVE',
        id_type: 'NIN',
        id_number: '99999999999',
        shares_allotted: 800000,
        share_percentage: 80,
        aml_flag: true,
      },
    ],
  },
}

export function getSandboxKybCheck(rcInput: string) {
  const cleanRc = rcInput.replace(/[^0-9]/g, '')

  if (cleanRc === '9999999' || !MOCK_COMPANIES[cleanRc]) {
    return {
      status: 404,
      body: {
        status: 'error',
        code: 'not_found',
        message: 'Registration number not found in Corporate Affairs Commission (CAC) registry.',
        data: null,
      },
    }
  }

  const record = MOCK_COMPANIES[cleanRc]
  return {
    status: 200,
    body: {
      status: 'success',
      data: record.company,
    },
  }
}

export function getSandboxDirectors(rcInput: string) {
  const cleanRc = rcInput.replace(/[^0-9]/g, '')

  if (cleanRc === '9999999' || !MOCK_COMPANIES[cleanRc]) {
    return {
      status: 404,
      body: {
        status: 'error',
        code: 'not_found',
        message: 'Company not found or no directors on record.',
        data: [],
      },
    }
  }

  const record = MOCK_COMPANIES[cleanRc]
  return {
    status: 200,
    body: {
      status: 'success',
      company_name: record.company.company_name,
      rc_number: record.company.rc_number,
      directors_count: record.directors.length,
      data: record.directors,
    },
  }
}
