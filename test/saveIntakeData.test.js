const saveIntakeData = require('../functions/saveIntakeData');

describe('saveIntakeData', () => {
  test('should save intake data and return case number', async () => {
    const mockIntakeData = {
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
    };

    const result = await saveIntakeData(mockIntakeData);

    expect(result).toHaveProperty('caseNumber');
    expect(result).toHaveProperty('status');
    expect(result.status).toBe('success');
    expect(result.caseNumber).toMatch(/^ILH-\d+-[A-Z0-9]{5}$/);
  });
}); 