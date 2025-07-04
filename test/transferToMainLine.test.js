const transferToMainLine = require('../functions/transferToMainLine');

describe('transferToMainLine', () => {
  test('should transfer call to main line', async () => {
    const mockArgs = {
      callSid: 'CA1234567890abcdef'
    };

    const result = await transferToMainLine(mockArgs);

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('message');
    expect(result.status).toBe('success');
    expect(result.message).toBe('Call transferred to main line successfully');
  });
}); 