const transferToAttorney = require('../functions/transferToAttorney');

describe('transferToAttorney', () => {
  test('should transfer call to attorney with intake data', async () => {
    const mockArgs = {
      callSid: 'CA1234567890abcdef',
      intakeData: {
        name: 'John Smith',
        phoneNumber: '555-123-4567',
        emailAddress: 'john.smith@email.com',
        accidentDate: '2024-01-15',
        injuryDescription: 'I was rear-ended and have neck pain',
        medicalTreatment: 'Yes, I went to the ER and got x-rays',
        atFaultParty: 'The other driver was at fault',
        policeReport: 'Yes, there was a police report and I have a copy',
        otherPartyInsurance: 'I don\'t know about their insurance',
        signedDocuments: 'No, I haven\'t signed anything yet'
      }
    };

    const result = await transferToAttorney(mockArgs);

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('attorneyName');
    expect(result.status).toBe('success');
    expect(result.attorneyName).toBe('Attorney Smith');
  });
}); 