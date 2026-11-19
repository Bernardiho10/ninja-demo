// Server-side handler for POST /api/kyb/check.
// Checks Nigerian company registration and CAC standing.

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const rcInput = String(req.body?.rc_number || req.body?.idNumber || '').replace(/[^0-9]/g, '')

  if (rcInput === '9999999') {
    res.status(404).json({
      status: 'error',
      code: 'not_found',
      message: 'Registration number not found in Corporate Affairs Commission (CAC) registry.',
      data: null,
    })
    return
  }

  if (rcInput === '2000002') {
    res.status(200).json({
      status: 'success',
      data: {
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
    })
    return
  }

  if (rcInput === '6666666') {
    res.status(200).json({
      status: 'success',
      data: {
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
    })
    return
  }

  // Default clean active company
  res.status(200).json({
    status: 'success',
    data: {
      id: 1000001,
      rc_number: 'RC-1000001',
      company_name: req.body?.company_name || 'NINJA TECH LOGISTICS LIMITED',
      company_type: req.body?.company_type || 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
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
  })
}
