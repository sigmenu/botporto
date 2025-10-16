const openAIService = require('./openai-service');

async function testImprovedAI() {
  console.log('=== Testing Improved AI with Proactive Link Sharing ===');
  
  // Test with the real user ID that has restaurant data
  const userId = 'test-user-id';
  
  console.log(`Testing AI for user: ${userId}`);
  
  // Test scenarios
  const testScenarios = [
    {
      name: 'Greeting Test',
      message: 'Oi, boa tarde!',
      expected: 'Should include delivery link'
    },
    {
      name: 'Delivery Question',
      message: 'Quero fazer um pedido',
      expected: 'Should include delivery link'
    },
    {
      name: 'Menu Question',
      message: 'Qual é o cardápio?',
      expected: 'Should include delivery link'
    },
    {
      name: 'Reservation Question',
      message: 'Tem mesa disponível?',
      expected: 'Should include reservation link'
    },
    {
      name: 'General Question',
      message: 'Que horas vocês fecham?',
      expected: 'May include links proactively'
    }
  ];
  
  // Test greeting function
  console.log('\n=== Testing Greeting Function ===');
  const greeting = await openAIService.generateGreeting('João', 'gpt-4o-mini', userId);
  console.log('Generated Greeting:', greeting);
  
  // Test each scenario
  for (const scenario of testScenarios) {
    console.log(`\n=== ${scenario.name} ===`);
    console.log(`Question: "${scenario.message}"`);
    console.log(`Expected: ${scenario.expected}`);
    
    const response = await openAIService.generateResponse(
      scenario.message,
      null,
      'gpt-4o-mini',
      userId
    );
    
    if (response.success) {
      console.log('AI Response:', response.response);
      
      // Check if links are present (using actual current restaurant links)
      const hasDeliveryLink = response.response.includes('delivery.pizzapalace.com') || 
                              response.response.includes('sigmenu.com/delivery/sigsushi');
      const hasReservationLink = response.response.includes('reservations.pizzapalace.com') ||
                                 response.response.includes('sigmenu.com/reserva/sigsushi');
      
      console.log('✓ Contains delivery link:', hasDeliveryLink);
      console.log('✓ Contains reservation link:', hasReservationLink);
    } else {
      console.log('❌ Error:', response.error);
    }
    
    console.log('-'.repeat(60));
  }
  
  console.log('\n=== Test completed ===');
}

testImprovedAI().catch(console.error);