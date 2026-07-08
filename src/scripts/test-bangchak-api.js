async function testBangchak() {
    const url = "https://oil-price.bangchak.co.th/ApiOilPrice2/th"
    console.log(`Testing Bangchak API: ${url}...`)
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.bangchak.co.th/'
            }
        })
        const data = await response.json()
        
        // Parse the stringified JSON array in OilList
        let oilList = []
        if (Array.isArray(data) && data.length > 0) {
            const rawOilList = data[0].OilList
            oilList = typeof rawOilList === 'string' ? JSON.parse(rawOilList) : (rawOilList || [])
        } else if (data && data.OilList) {
            oilList = typeof data.OilList === 'string' ? JSON.parse(data.OilList) : (data.OilList || [])
        }
        
        console.log('--- START OIL LIST ---')
        oilList.forEach(o => console.log(`- ${o.OilName}: Today=${o.PriceToday}, Tomorrow=${o.PriceTomorrow}`))
        console.log('--- END OIL LIST ---')

        const standardDiesel = oilList.find((oil) => oil.OilName === 'ไฮดีเซล S') 
            || oilList.find((oil) => oil.OilName.includes('ดีเซล') && !oil.OilName.includes('พรีเมียม') && !oil.OilName.includes('B20'))

        if (standardDiesel) {
            console.log('Success! Found Diesel:')
            console.log(JSON.stringify(standardDiesel, null, 2))
        } else {
            console.log('Standard Diesel not found. Available oils:', oilList.map(o => o.OilName).join(', '))
        }
    } catch (e) {
        console.error('Test failed:', e)
    }
}

testBangchak()
