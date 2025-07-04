const twilio = require('twilio');

const transferToMainLine = async (args) => {
  const { callSid } = args;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = twilio(accountSid, authToken);
  const MAIN_LINE_NUMBER = '+16156175000';

  try {
    // Redirect the call to the main line using Twilio's API
    await client.calls(callSid).update({
      url: `http://twimlets.com/forward?PhoneNumber=${encodeURIComponent(MAIN_LINE_NUMBER)}`,
      method: 'POST',
    });
    return {
      status: 'success',
      message: `You are now being transferred to our main line. If the call does not connect, our main line may be busy. Please try again later or leave a message.`,
    };
  } catch (error) {
    console.error('Error transferring call to main line:', error);
    return {
      status: 'error',
      message: 'Sorry, our main line is currently busy or unavailable. Please try again later or leave a message with your contact information.',
      error: error.message,
    };
  }
};

module.exports = transferToMainLine; 