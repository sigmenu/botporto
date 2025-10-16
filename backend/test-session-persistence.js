const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSessionPersistence() {
  console.log('🔍 Testing WhatsApp Session Persistence...');
  
  try {
    // Test 1: Check if WhatsAppSession table exists
    console.log('\n1. Checking if WhatsAppSession table exists...');
    const sessions = await prisma.whatsAppSession.findMany();
    console.log(`✅ Table exists. Found ${sessions.length} existing sessions:`);
    sessions.forEach(session => {
      console.log(`   - ID: ${session.id}, Phone: ${session.phoneNumber}, Status: ${session.status}`);
    });

    // Test 2: Try to create a test session
    console.log('\n2. Creating test session...');
    const testPhone = '555123456789';
    const testSessionId = 'test_session_' + Date.now();
    
    const savedSession = await prisma.whatsAppSession.upsert({
      where: { id: testSessionId },
      update: {
        phoneNumber: testPhone,
        status: 'CONNECTED',
        lastConnected: new Date()
      },
      create: {
        id: testSessionId,
        userId: 'test_user',
        name: `Test Session ${testPhone}`,
        phoneNumber: testPhone,
        status: 'CONNECTED',
        lastConnected: new Date()
      }
    });
    
    console.log(`✅ Session saved successfully:`, {
      id: savedSession.id,
      phoneNumber: savedSession.phoneNumber,
      status: savedSession.status,
      lastConnected: savedSession.lastConnected
    });

    // Test 3: Query for sessions to restore
    console.log('\n3. Querying sessions for restoration...');
    const sessionsToRestore = await prisma.whatsAppSession.findMany({
      where: {
        OR: [
          { status: 'CONNECTED' },
          { status: 'PENDING_RECONNECTION' }
        ],
        phoneNumber: { not: null }
      }
    });
    
    console.log(`✅ Found ${sessionsToRestore.length} sessions to restore:`);
    sessionsToRestore.forEach(session => {
      console.log(`   - Phone: ${session.phoneNumber}, Status: ${session.status}, Last: ${session.lastConnected}`);
    });

    // Test 4: Mark session for reconnection
    console.log('\n4. Testing mark for reconnection...');
    await prisma.whatsAppSession.update({
      where: { id: testSessionId },
      data: { status: 'PENDING_RECONNECTION' }
    });
    console.log(`✅ Marked session ${testPhone} for reconnection`);

    // Test 5: Clean up test session
    console.log('\n5. Cleaning up test session...');
    await prisma.whatsAppSession.delete({
      where: { id: testSessionId }
    });
    console.log(`✅ Test session cleaned up`);

    console.log('\n🎉 All session persistence tests passed!');
    
  } catch (error) {
    console.error('❌ Session persistence test failed:', error);
    console.error('Error details:', error.message);
    
    if (error.code === 'P2002') {
      console.log('💡 This is likely a unique constraint violation');
    }
    if (error.code === 'P2025') {
      console.log('💡 This is likely a record not found error');
    }
  } finally {
    await prisma.$disconnect();
  }
}

testSessionPersistence().catch(console.error);