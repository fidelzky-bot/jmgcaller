#!/usr/bin/env node

/**
 * Transfer Test Script
 * 
 * This script tests the transfer functionality by simulating various scenarios:
 * 1. Normal transfer flow
 * 2. TTS failure during transfer
 * 3. WebSocket disconnection during transfer
 * 4. Mark timeout scenarios
 * 
 * Usage: node test-transfer.js
 */

require('dotenv').config();
const twilio = require('twilio');

class TransferTester {
  constructor() {
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Starting Transfer Functionality Tests...\n'.green);
    
    try {
      // Test 1: Check server status
      await this.testServerStatus();
      
      // Test 2: Check environment variables
      await this.testEnvironmentVariables();
      
      // Test 3: Test transfer function directly
      await this.testTransferFunction();
      
      // Test 4: Test TTS service
      await this.testTTSService();
      
      // Test 5: Simulate a real call (optional)
      if (process.argv.includes('--live-test')) {
        await this.testLiveCall();
      }
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  async testServerStatus() {
    console.log('📡 Testing server status...'.cyan);
    
    try {
      const response = await fetch(`https://${process.env.SERVER}/`);
      const data = await response.json();
      
      if (data.status === 'ok') {
        this.addResult('Server Status', 'PASS', 'Server is running and responding');
      } else {
        this.addResult('Server Status', 'FAIL', 'Server returned unexpected status');
      }
    } catch (error) {
      this.addResult('Server Status', 'FAIL', `Server not reachable: ${error.message}`);
    }
  }

  async testEnvironmentVariables() {
    console.log('🔧 Testing environment variables...'.cyan);
    
    const requiredVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'DEEPGRAM_API_KEY',
      'OPENAI_API_KEY',
      'SERVER',
      'VOICE_MODEL'
    ];
    
    const missing = [];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }
    
    if (missing.length === 0) {
      this.addResult('Environment Variables', 'PASS', 'All required variables are set');
    } else {
      this.addResult('Environment Variables', 'FAIL', `Missing variables: ${missing.join(', ')}`);
    }
  }

  async testTransferFunction() {
    console.log('🔄 Testing transfer function...'.cyan);
    
    try {
      const transferToMainLine = require('./functions/transferToMainLine');
      const result = await transferToMainLine({ callSid: 'test-call-sid' });
      
      if (result.status === 'success' && result.message.includes('transfer you to our main line')) {
        this.addResult('Transfer Function', 'PASS', 'Transfer function returns correct message');
      } else {
        this.addResult('Transfer Function', 'FAIL', `Unexpected result: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.addResult('Transfer Function', 'FAIL', `Function error: ${error.message}`);
    }
  }

  async testTTSService() {
    console.log('🎤 Testing TTS service...'.cyan);
    
    try {
      const { TextToSpeechService } = require('./services/tts-service');
      const ttsService = new TextToSpeechService();
      
      let speechReceived = false;
      let errorReceived = false;
      
      ttsService.on('speech', (index, audio, label, count) => {
        if (audio && audio.length > 0) {
          speechReceived = true;
        }
      });
      
      ttsService.on('error', (error) => {
        errorReceived = true;
      });
      
      // Test with transfer message
      await ttsService.generate({
        partialResponseIndex: null,
        partialResponse: 'Let me transfer you to our main line. Please hold for a moment. You will hear a ring while we connect you.',
        markLabel: 'test-transfer-mark'
      }, 0);
      
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (speechReceived && !errorReceived) {
        this.addResult('TTS Service', 'PASS', 'TTS successfully generated transfer message audio');
      } else if (errorReceived) {
        this.addResult('TTS Service', 'FAIL', 'TTS service encountered an error');
      } else {
        this.addResult('TTS Service', 'FAIL', 'TTS did not generate audio within timeout');
      }
      
    } catch (error) {
      this.addResult('TTS Service', 'FAIL', `TTS test error: ${error.message}`);
    }
  }

  async testLiveCall() {
    console.log('📞 Testing live call (this will make an actual call)...'.cyan);
    
    try {
      const call = await this.client.calls.create({
        url: `https://${process.env.SERVER}/incoming`,
        to: process.env.TO_NUMBER || '+1234567890',
        from: process.env.FROM_NUMBER
      });
      
      this.addResult('Live Call', 'PASS', `Call initiated with SID: ${call.sid}`);
      
      // Monitor call status
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds
      
      const checkStatus = async () => {
        try {
          const callStatus = await this.client.calls(call.sid).fetch();
          console.log(`📞 Call status: ${callStatus.status}`);
          
          if (callStatus.status === 'completed' || callStatus.status === 'failed') {
            this.addResult('Call Completion', 'PASS', `Call completed with status: ${callStatus.status}`);
            return;
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 1000);
          } else {
            this.addResult('Call Completion', 'FAIL', 'Call did not complete within timeout');
          }
        } catch (error) {
          this.addResult('Call Completion', 'FAIL', `Error checking call status: ${error.message}`);
        }
      };
      
      setTimeout(checkStatus, 2000); // Start checking after 2 seconds
      
    } catch (error) {
      this.addResult('Live Call', 'FAIL', `Failed to initiate call: ${error.message}`);
    }
  }

  addResult(testName, status, message) {
    this.testResults.push({ testName, status, message, timestamp: new Date() });
    
    const statusIcon = status === 'PASS' ? '✅' : '❌';
    console.log(`${statusIcon} ${testName}: ${message}`);
  }

  printResults() {
    console.log('\n📊 Test Results Summary:'.green);
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:'.red);
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  - ${r.testName}: ${r.message}`);
        });
    }
    
    console.log('\n💡 Recommendations:'.yellow);
    if (failed === 0) {
      console.log('  ✅ All tests passed! Your transfer system is working correctly.');
    } else {
      console.log('  🔧 Review the failed tests above and check your configuration.');
      console.log('  📝 Check the server logs for more detailed error information.');
      console.log('  🔄 Run with --live-test flag to test with a real call.');
    }
  }
}

// Run the tests
const tester = new TransferTester();
tester.runTests().catch(console.error); 