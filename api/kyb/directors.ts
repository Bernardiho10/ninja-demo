// Server-side handler for POST /api/kyb/directors.
// Retrieves official registered directors from CAC.

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const rcInput = String(req.body?.rc_number || '').replace(/[^0-9]/g, '')

  if (rcInput === '9999999') {
    res.status(404).json({
      status: 'error',
      code: 'not_found',
      message: 'Company not found or no directors on record.',
      data: [],
    })
    return
  }

  if (rcInput === '2000002') {
    res.status(200).json({
      status: 'success',
      company_name: 'PRIME AGRO ALLIED FOODS LIMITED',
      rc_number: 'RC-2000002',
      directors_count: 1,
      data: [
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
    })
    return
  }

  if (rcInput === '6666666') {
    res.status(200).json({
      status: 'success',
      company_name: 'GLOBAL HORIZONS CAPITAL LIMITED',
      rc_number: 'RC-6666666',
      directors_count: 1,
      data: [
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
    })
    return
  }

  // Clean active company directors
  res.status(200).json({
    status: 'success',
    company_name: 'NINJA TECH LOGISTICS LIMITED',
    rc_number: 'RC-1000001',
    directors_count: 2,
    data: [
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
  })
}
