const openAIService = require('./openai-service');

async function testAIWithRestaurant() {
  console.log('=== Testing AI Service with Restaurant Data ===');
  
  // Test with the real user ID that has restaurant data
  const userId = 'cmgpq10iv0002rxdiub1sgsj2';
  
  console.log(`Testing AI for user: ${userId}`);
  
  // Test question about restaurant hours
  console.log('\n1. Testing business hours question...');
  const hoursResponse = await openAIService.generateResponse(
    'Que horas vocês abrem?',
    null,
    'gpt-4o-mini',
    userId
  );
  console.log('Question: Que horas vocês abrem?');
  console.log('Response:', hoursResponse);
  
  // Test question about delivery
  console.log('\n2. Testing delivery question...');
  const deliveryResponse = await openAIService.generateResponse(
    'Vocês fazem entrega?',
    null,
    'gpt-4o-mini',
    userId
  );
  console.log('Question: Vocês fazem entrega?');
  console.log('Response:', deliveryResponse);
  
  // Test question about address
  console.log('\n3. Testing address question...');
  const addressResponse = await openAIService.generateResponse(
    'Qual é o endereço do restaurante?',
    null,
    'gpt-4o-mini',
    userId
  );
  console.log('Question: Qual é o endereço do restaurante?');
  console.log('Response:', addressResponse);
  
  console.log('\n=== Test completed ===');
}

testAIWithRestaurant().catch(console.error);