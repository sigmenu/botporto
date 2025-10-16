const openAIService = require('./openai-service');

async function testOpenAI() {
  try {
    console.log('Testing OpenAI service with restaurant context...');
    
    const response = await openAIService.generateResponse(
      'Olá! Gostaria de fazer um pedido. Quais pizzas vocês têm disponíveis?',
      null,
      'gpt-4o-mini',
      'test-user-id'
    );
    
    console.log('\n=== AI Response ===');
    console.log('Success:', response.success);
    console.log('Response:', response.response);
    
    if (response.usage) {
      console.log('\n=== Token Usage ===');
      console.log('Prompt tokens:', response.usage.prompt_tokens);
      console.log('Completion tokens:', response.usage.completion_tokens);
      console.log('Total tokens:', response.usage.total_tokens);
    }
    
  } catch (error) {
    console.error('Error testing OpenAI:', error);
  }
}

testOpenAI();