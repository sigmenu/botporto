const openAIService = require('./openai-service');

async function testCriticalDelivery() {
  console.log('=== CRITICAL TEST: Ensuring Links Are Always Included ===');
  
  const userId = 'test-user-id';
  
  // Critical delivery questions that MUST include links
  const criticalTests = [
    'Vocês fazem delivery?',
    'Como faço pedido?',
    'Quero pedir comida',
    'Tem reserva?',
    'Oi',
    'Boa tarde'
  ];
  
  for (const question of criticalTests) {
    console.log(`\n=== TESTING: "${question}" ===`);
    
    const response = await openAIService.generateResponse(
      question,
      null,
      'gpt-4o-mini',
      userId
    );
    
    if (response.success) {
      console.log('Response:', response.response);
      
      // Check for ANY URL in response
      const hasAnyUrl = response.response.includes('http');
      const hasDeliveryUrl = response.response.includes('sigmenu.com/delivery/sigsushi');
      const hasReservationUrl = response.response.includes('sigmenu.com/reserva/sigsushi');
      
      console.log('✅ Contains ANY URL:', hasAnyUrl);
      console.log('📱 Contains delivery URL:', hasDeliveryUrl);
      console.log('📅 Contains reservation URL:', hasReservationUrl);
      
      if (!hasAnyUrl) {
        console.log('❌ CRITICAL FAIL: No URLs found in response!');
      }
    } else {
      console.log('❌ ERROR:', response.error);
    }
    
    console.log('-'.repeat(70));
  }
  
  console.log('\n=== CRITICAL TEST COMPLETED ===');
}

testCriticalDelivery().catch(console.error);