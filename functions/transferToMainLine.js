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
      message: `Call transferred to main line (${MAIN_LINE_NUMBER}) successfully`,
    };
  } catch (error) {
    console.error('Error transferring call to main line:', error);
    return {
      status: 'error',
      message: 'Failed to transfer call to main line',
      error: error.message,
    };
  }
};

module.exports = transferToMainLine; 