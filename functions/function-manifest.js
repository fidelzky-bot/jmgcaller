// create metadata for all the available functions to pass to completions API
const tools = [
  {
    type: 'function',
    function: {
      name: 'transferToMainLine',
      say: 'Let me transfer you to our main line.',
      description: 'Transfer the caller to the main office line when they are not calling about a new case.',
      parameters: {
        type: 'object',
        properties: {
          callSid: {
            type: 'string',
            description: 'The unique identifier for the active phone call.',
          },
        },
        required: ['callSid'],
      },
      returns: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Whether or not the customer call was successfully transferred to main line'
          }
        }
      }
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferToAttorney',
      say: 'Ok, I think we can help you. Please hold for a moment while I transfer you to the attorney who will help you from here forward.',
      description: 'Transfer the caller to an attorney after completing the preliminary intake process.',
      parameters: {
        type: 'object',
        properties: {
          callSid: {
            type: 'string',
            description: 'The unique identifier for the active phone call.',
          },
          intakeData: {
            type: 'object',
            description: 'The collected intake information including name, phone, email, accident details, etc.',
          },
        },
        required: ['callSid', 'intakeData'],
      },
      returns: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Whether or not the customer call was successfully transferred to attorney'
          },
          attorneyName: {
            type: 'string',
            description: 'The name of the attorney the call was transferred to'
          }
        }
      }
    },
  },
  {
    type: 'function',
    function: {
      name: 'saveIntakeData',
      say: 'I\'m saving your information to our system.',
      description: 'Save the collected intake information to the law firm\'s database.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The caller\'s full name',
          },
          phoneNumber: {
            type: 'string',
            description: 'The caller\'s phone number',
          },
          emailAddress: {
            type: 'string',
            description: 'The caller\'s email address',
          },
          accidentDate: {
            type: 'string',
            description: 'The date of the accident',
          },
          injuryDescription: {
            type: 'string',
            description: 'Description of injuries and accident details',
          },
          medicalTreatment: {
            type: 'string',
            description: 'Information about hospital visits and medical treatment',
          },
          atFaultParty: {
            type: 'string',
            description: 'Information about who was at fault',
          },
          policeReport: {
            type: 'string',
            description: 'Information about police report and whether caller has a copy',
          },
          otherPartyInsurance: {
            type: 'string',
            description: 'Information about the other party\'s insurance',
          },
          signedDocuments: {
            type: 'string',
            description: 'Information about any documents signed with insurance companies or other lawyers',
          },
        },
        required: ['name', 'phoneNumber', 'emailAddress', 'accidentDate', 'injuryDescription', 'medicalTreatment', 'atFaultParty', 'policeReport', 'otherPartyInsurance', 'signedDocuments'],
      },
      returns: {
        type: 'object',
        properties: {
          caseNumber: {
            type: 'string',
            description: 'The generated case number for this intake'
          },
          status: {
            type: 'string',
            description: 'Whether the intake data was successfully saved'
          }
        }
      }
    },
  },
];

module.exports = tools;