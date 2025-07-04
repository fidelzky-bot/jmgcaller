const twilio = require('twilio');

const transferToAttorney = async (args) => {
  const { callSid, intakeData } = args;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = twilio(accountSid, authToken);
  const ATTORNEY_LINE_NUMBER = '+16156175000';

  try {
    // Optionally, save intakeData to your database here

    // Redirect the call to the attorney line using Twilio's API
    await client.calls(callSid).update({
      url: `http://twimlets.com/forward?PhoneNumber=${encodeURIComponent(ATTORNEY_LINE_NUMBER)}`,
      method: 'POST',
    });
    return {
      status: 'success',
      attorneyName: 'Attorney Intake',
      message: `Call transferred to attorney line (${ATTORNEY_LINE_NUMBER}) successfully`,
    };
  } catch (error) {
    console.error('Error transferring call to attorney line:', error);
    return {
      status: 'error',
      message: 'Failed to transfer call to attorney line',
      error: error.message,
    };
  }
};

module.exports = transferToAttorney; 