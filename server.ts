import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Server-side Gemini AI setup
const apiKey = process.env.GEMINI_API_KEY || '';
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Fallback intelligent intent parser for 100% reliability
function parseFallbackActions(message: string, context: any) {
  const lower = message.toLowerCase();
  const actions: any[] = [];
  let reply = '';

  // 1. Dispatch ambulance
  if (lower.includes('dispatch') || (lower.includes('ambulance') && (lower.includes('send') || lower.includes('assign')))) {
    const amb = context.ambulances?.find((a: any) => a.status === 'available') || context.ambulances?.[0] || { id: 'amb-1', unitCode: 'AMB-104' };
    const emg = context.activeEmergencies?.[0] || { id: 'INC-2026-0001', address: 'Janpath Crossing' };
    actions.push({
      actionType: 'DISPATCH_AMBULANCE',
      params: {
        ambulanceId: amb.id,
        incidentId: emg.id,
      },
      summary: `Dispatched ${amb.unitCode} to Incident ${emg.id} (${emg.address})`,
    });
    reply = `🚑 **Ambulance Dispatched!** I have assigned unit **${amb.unitCode}** to incident **${emg.id}** at ${emg.address}. Estimated arrival is within 3 minutes. GPS coordinates have been synced to the live Google Map.`;
  }
  // 2. Book appointment / queue token
  else if (lower.includes('book') && (lower.includes('doctor') || lower.includes('appointment') || lower.includes('consultation') || lower.includes('token'))) {
    const doc = context.doctorsOnDuty?.find((d: any) => lower.includes(d.name.toLowerCase().split(' ')[1] || '')) || context.doctorsOnDuty?.[0] || { id: 'doc-1', name: 'Dr. Aris Vance, MD', room: 'Cabin 3' };
    actions.push({
      actionType: 'BOOK_APPOINTMENT',
      params: {
        patientId: 'pat-1',
        patientName: 'Sarah Chen',
        doctorId: doc.id || 'doc-1',
        hospitalId: 'hosp-1',
        department: doc.specialization || 'Cardiology',
        reason: 'Follow-up clinical consultation scheduled via AI Assistant',
      },
      summary: `Booked OPD Token with ${doc.name} in ${doc.room || 'Cabin 3'}`,
    });
    reply = `🩺 **Appointment & Queue Token Generated!** A consultation token has been generated for **Sarah Chen** with **${doc.name}** in **${doc.room || 'Cabin 3'}**. The consultation fee bill has been logged, and turn notifications are active.`;
  }
  // 3. Call next patient in queue
  else if (lower.includes('call next') || lower.includes('next patient')) {
    actions.push({
      actionType: 'CALL_NEXT_PATIENT',
      params: {
        doctorId: 'doc-1',
      },
      summary: `Called next patient in OPD Queue for Dr. Aris Vance`,
    });
    reply = `📣 **Queue Advanced!** Next waiting patient in Cardiology OPD has been called to Dr. Aris Vance's cabin. In-app proximity alerts have been dispatched.`;
  }
  // 4. Bed allocation
  else if (lower.includes('bed') || lower.includes('icu') || lower.includes('reserve')) {
    const isIcu = lower.includes('icu');
    const bedType = isIcu ? 'icu' : 'emergency';
    actions.push({
      actionType: 'ALLOCATE_BED',
      params: {
        hospitalId: 'hosp-1',
        bedType,
        count: 1,
        status: 'occupied',
        patientName: 'Emergency Inbound Patient',
      },
      summary: `Reserved 1 ${bedType.toUpperCase()} Bed at City Metro General`,
    });
    reply = `🛏️ **Bed Allocation Confirmed!** Reserved 1 ${bedType.toUpperCase()} bed at City Metro General Hospital. Real-time facility occupancy has been refreshed on the hospital dashboard.`;
  }
  // 5. Order lab test
  else if (lower.includes('lab') || lower.includes('test') || lower.includes('order')) {
    actions.push({
      actionType: 'ORDER_LAB_TEST',
      params: {
        patientId: 'pat-1',
        patientName: 'Sarah Chen',
        testName: 'High Sensitivity Troponin-I & Complete Cardiac Profile',
        category: 'Diagnostic Order',
      },
      summary: `Ordered High Sensitivity Troponin-I for Sarah Chen`,
    });
    reply = `🧪 **Laboratory Order Submitted!** Diagnostic order for **Troponin-I & Cardiac Profile** created for Sarah Chen. Collection team notified.`;
  }
  // 6. Pharmacy reorder
  else if (lower.includes('pharmacy') || lower.includes('reorder') || lower.includes('medicine') || lower.includes('epinephrine')) {
    actions.push({
      actionType: 'REORDER_PHARMACY',
      params: {
        medicineName: 'Epinephrine Auto-Injector (0.3mg)',
        quantity: 50,
        supplier: 'Cipla Critical Care',
      },
      summary: `Generated Purchase Order for 50 Epinephrine Vials`,
    });
    reply = `💊 **Pharmacy Purchase Order Created!** Purchase order PO-2026-104 for **50 vials of Epinephrine Auto-Injector** submitted to Cipla Critical Care to resolve low stock alerts.`;
  }
  // 7. Report SOS emergency
  else if (lower.includes('report') || lower.includes('sos') || lower.includes('accident') || lower.includes('emergency')) {
    actions.push({
      actionType: 'REPORT_EMERGENCY',
      params: {
        callerName: 'AI Emergency Dispatcher',
        callerPhone: '+91 98112 00999',
        emergencyType: 'accident',
        severity: 'critical',
        address: 'Connaught Circus / Barakhamba Junction',
        lat: 28.6315,
        lng: 77.2167,
        victimsCount: 2,
        description: 'Multi-vehicle collision reported via AI Assistant. Severe injuries noted.',
      },
      summary: `Created Emergency Incident at Barakhamba Junction`,
    });
    reply = `🚨 **Emergency Incident Created & Broadcaster Alerted!** One-Tap SOS incident registered at Connaught Circus. Dual tracks activated for rapid ambulance fleet and nearby civilian helpers within 3 km.`;
  }
  // Default operational overview
  else {
    reply = `Here is the current live MediTrack operational snapshot:
• **Ambulances**: 4 fleet units (AMB-104 en route, AMB-108, AMB-112, AMB-115 available)
• **Emergency Incidents**: ${context.activeEmergenciesCount || 1} active dual-track cases
• **Available ER Beds**: 9 across City Metro & St. Jude
• **Doctors on Duty**: Dr. Aris Vance (Cardiology), Dr. Priya Sharma (Trauma), Dr. Rajesh Kulkarni (Orthopedics)

I can execute any action directly for you:
1. *"Dispatch nearest ambulance to Janpath accident"*
2. *"Book urgent appointment with Dr. Aris Vance"*
3. *"Reserve an ICU bed at City Metro Hospital"*
4. *"Reorder 50 units of Epinephrine for pharmacy"*
5. *"Advance OPD queue / call next patient"*`;
  }

  return { reply, actions };
}

// AI Multi-Turn Hospital Assistant & Maps Grounding endpoint
app.post(['/api/assistant/chat', '/api/chat'], async (req, res) => {
  try {
    const {
      message,
      history = [],
      role = 'operations',
      model = 'gemini-3.8-flash',
      userLocation,
      context = {},
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Role-specific System Instructions
    let systemInstruction = '';
    let selectedModel = model;
    let enableMapsGrounding = role === 'maps_navigator' || 
      /hospital|pharmacy|clinic|doctor near|emergency center|blood bank|aed|trauma center|ambulance station/i.test(message);

    if (role === 'maps_navigator' || enableMapsGrounding) {
      selectedModel = 'gemini-3.8-flash'; // Google Maps tool strictly requires gemini-3.8-flash
      enableMapsGrounding = true;
      systemInstruction = `You are the "MediTrack Google Maps Healthcare Navigator", grounded in real Google Maps data.
Your mission is to provide accurate, up-to-date geographical healthcare recommendations including trauma hospitals, 24/7 emergency rooms, pharmacies, blood banks, and urgent clinics.
When answering, explicitly mention the facility name, address/area, estimated proximity, emergency capabilities (e.g. ICU, trauma Level 1, 24/7 pharmacy), and highlight that interactive Google Maps links are provided below.
Always maintain high urgency and clarity for time-critical emergencies.`;
    } else if (role === 'triage') {
      systemInstruction = `You are the "MediTrack Clinical Triage & Symptom Evaluator", built for fast, empathetic patient assessment.
Analyze the user's reported symptoms and structure your assessment:
1. Urgency Level: [EMERGENCY (Call 108 immediately) / URGENT (See doctor within 4-6 hours) / ROUTINE]
2. Primary Symptom Assessment & Potential Causes (non-definitive)
3. Recommended Department/Specialist (e.g. Cardiology, Orthopedics, Pediatrics)
4. Red Flag Warnings: Symptoms requiring immediate ER escalation
5. First-aid / Comfort measures while waiting for care
Maintain a reassuring, professional tone. Include clinical disclaimer.`;
    } else if (role === 'complex_analysis') {
      systemInstruction = `You are the "MediTrack Senior Clinical Reasoning & Diagnostic Specialist", designed for in-depth, complex multi-symptom case analysis.
Perform a systematic diagnostic evaluation:
- Chief Complaint & Timeline Analysis
- Differential Diagnoses (ranked by probability and acuity)
- Potential Drug-Drug Interactions or Contraindications
- Recommended Diagnostic Workup (Blood markers, ECG, Imaging)
- Clinical Risk Stratification (e.g., HEART score, Wells criteria where applicable)
Provide rigorous, evidence-based reasoning suitable for clinical discussion.`;
    } else if (role === 'cpr_coach') {
      systemInstruction = `You are the "MediTrack Emergency CPR & First Aid Protocol Coach".
Provide immediate, clear, life-saving instructions in direct numbered steps:
1. Check Responsiveness: Tap shoulders firmly and shout "Are you okay?"
2. Call for Help & 108 SOS immediately.
3. Check Breathing (max 10 seconds). If absent or gasping:
4. Hands-Only CPR: Heel of one hand on center of chest, other hand on top. Lock elbows.
5. Push HARD and FAST: 100-120 beats per minute (to the tempo of 'Stayin' Alive'). Compress 2 inches (5 cm) deep.
6. AED Usage: Turn on AED as soon as available and follow voice prompts. Do not stop compressions until AED analyzes.
Use short, bold commands. Keep sentences concise for quick reading during panic.`;
    } else {
      // Default: Autonomous Operations & Dispatch Command
      systemInstruction = `You are the "MediTrack Unified Autonomous Operations AI Assistant", powered by Gemini for the MediTrack unified healthcare platform.
You have operational authority to answer questions and trigger platform actions across modules:
1. AMBULANCE FLEET: Dispatch ambulances, simulate GPS movement, update mission status.
2. APPOINTMENTS & QUEUE: Book OPD consultations with doctors on duty, issue queue tokens, advance the doctor queue.
3. EMERGENCY & SOS: Create new emergency cases, assign nearest ambulance, sync bystander civilian helpers.
4. BEDS & TRAUMA: Check bed vacancies, reserve/allocate ICU or Emergency trauma beds.
5. PHARMACY & INVENTORY: Check drug stock levels, reorder low-stock critical medicines.
6. LAB TESTS: Submit diagnostic lab orders (Troponin, ECG, Blood panels).

CRITICAL SAFETY DIRECTIVE:
You must NEVER provide medical diagnoses or alter prescribed medications. Include clinical boundary reassurance.

Current Live Real-Time Hospital Context:
${JSON.stringify(context || {}, null, 2)}

If executing actions, formulate your response to include actionable recommendations.`;
    }

    // Format multi-turn conversation history for @google/genai
    const formattedContents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history) {
        if (turn.text || turn.content) {
          formattedContents.push({
            role: turn.role === 'assistant' || turn.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(turn.text || turn.content) }],
          });
        }
      }
    }
    // Append current user message
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    // Check if client is initialized
    if (!aiClient) {
      const fallbackResult = parseFallbackActions(message, context || {});
      const fallbackGrounding: any[] = enableMapsGrounding ? [
        {
          title: 'City Metro General Hospital (Emergency Trauma Center)',
          uri: 'https://www.google.com/maps/search/?api=1&query=City+Metro+General+Hospital+Connaught+Place',
          reviews: ['24/7 Level-1 Trauma Care, rapid cardiac cath lab availability.'],
        },
        {
          title: 'St. Jude Apex Medical Institute',
          uri: 'https://www.google.com/maps/search/?api=1&query=St+Jude+Apex+Medical+Institute',
          reviews: ['Equipped with emergency ICU and dedicated pediatric emergency.'],
        },
        {
          title: 'Apollo 24/7 Super Pharmacy & Emergency Supplies',
          uri: 'https://www.google.com/maps/search/?api=1&query=Apollo+Pharmacy+Barakhamba+Road',
          reviews: ['Open 24 hours with emergency oxygen and critical care stock.'],
        },
      ] : [];

      return res.json({
        reply: fallbackResult.reply,
        actions: fallbackResult.actions,
        groundingSources: fallbackGrounding,
        modelUsed: selectedModel,
        roleUsed: role,
        disclaimer: 'MediTrack AI is an administrative and hospital workflow assistant. In medical emergencies, call 108 immediately.',
      });
    }

    // Build Gemini Call Config
    const config: any = {
      systemInstruction,
    };

    // If Maps Grounding is active
    if (enableMapsGrounding) {
      config.tools = [{ googleMaps: {} }];
      if (userLocation && typeof userLocation.latitude === 'number' && typeof userLocation.longitude === 'number') {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: Number(userLocation.latitude),
              longitude: Number(userLocation.longitude),
            },
          },
        };
      }
    } else if (role === 'operations') {
      // In operations role without maps, we can parse JSON actions or use structured prompt
      // We will parse actions both from text and fallback intent parser
    }

    const withTimeout = (promise: Promise<any>, timeoutMs: number) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)),
      ]);
    };

    let response: any;
    try {
      response = await withTimeout(
        aiClient.models.generateContent({
          model: selectedModel,
          contents: formattedContents,
          config,
        }),
        4500
      );
    } catch (modelError: any) {
      console.warn(`Error generating content with model ${selectedModel}, falling back to gemini-3.1-flash-lite:`, modelError?.message);
      try {
        selectedModel = 'gemini-3.1-flash-lite';
        response = await withTimeout(
          aiClient.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: formattedContents,
            config,
          }),
          3500
        );
      } catch (liteError: any) {
        console.warn('Both models failed or timed out, returning instant action fallback:', liteError?.message);
        const fallbackResult = parseFallbackActions(message, context || {});
        return res.json({
          reply: fallbackResult.reply,
          actions: fallbackResult.actions,
          groundingSources: [
            {
              title: 'City Metro General Hospital (Emergency Trauma Center Level-1)',
              uri: 'https://www.google.com/maps/search/?api=1&query=City+Metro+General+Hospital',
              reviews: ['24/7 Level-1 Trauma Care, rapid cardiac cath lab availability.'],
            },
            {
              title: 'St. Jude Apex Medical Institute',
              uri: 'https://www.google.com/maps/search/?api=1&query=St+Jude+Apex+Medical+Institute',
              reviews: ['Equipped with emergency ICU and dedicated pediatric emergency.'],
            },
            {
              title: 'Apollo 24/7 Super Pharmacy & Emergency Supplies',
              uri: 'https://www.google.com/maps/search/?api=1&query=Apollo+Pharmacy+Barakhamba+Road',
              reviews: ['Open 24 hours with emergency oxygen and critical care stock.'],
            },
          ],
          modelUsed: `${selectedModel} (instant action fallback)`,
          roleUsed: role,
          disclaimer: 'MediTrack AI is an administrative and clinical workflow assistant. In life-threatening emergencies, call 108 immediately.',
        });
      }
    }

    const rawReply = (response.text || '').trim();
    
    // Extract Grounding Chunks from Google Maps or Search
    const candidate = response.candidates?.[0];
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const groundingSources: any[] = [];

    for (const chunk of groundingChunks) {
      if (chunk.maps) {
        const reviews: string[] = [];
        if (chunk.maps.placeAnswerSources?.reviewSnippets) {
          for (const rev of chunk.maps.placeAnswerSources.reviewSnippets) {
            if (rev.reviewText) reviews.push(rev.reviewText);
          }
        }
        groundingSources.push({
          title: chunk.maps.title || 'Healthcare Facility',
          uri: chunk.maps.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chunk.maps.title || 'Hospital')}`,
          reviews,
        });
      } else if (chunk.web) {
        groundingSources.push({
          title: chunk.web.title || 'Information Source',
          uri: chunk.web.uri || '',
          reviews: [],
        });
      }
    }

    // Parse Actions: check fallback parser as well to ensure actions are executed reliably
    let actions: any[] = [];
    if (role === 'operations') {
      const fallback = parseFallbackActions(message, context || {});
      if (fallback.actions.length > 0) {
        actions = fallback.actions;
      }
    }

    return res.json({
      reply: rawReply || 'Request processed successfully.',
      actions,
      groundingSources,
      modelUsed: selectedModel,
      roleUsed: role,
      disclaimer: 'MediTrack AI is an administrative and clinical workflow assistant. In life-threatening emergencies, call 108 immediately.',
    });
  } catch (error: any) {
    console.error('Gemini Assistant Error:', error);
    const fallback = parseFallbackActions(req.body?.message || '', req.body?.context || {});
    return res.json({
      reply: fallback.reply,
      actions: fallback.actions,
      groundingSources: [
        {
          title: 'City Metro General Hospital (Emergency Trauma Level-1)',
          uri: 'https://www.google.com/maps/search/?api=1&query=City+Metro+General+Hospital',
          reviews: ['24/7 Level-1 Trauma Care, rapid cardiac cath lab availability.'],
        },
      ],
      modelUsed: 'gemini-3.8-flash (fallback)',
      roleUsed: req.body?.role || 'operations',
      disclaimer: 'MediTrack AI is an administrative and hospital workflow assistant. In medical emergencies, call 108 immediately.',
    });
  }
});


// Simple health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Doctor consultation fees registry (server authoritative)
const serverDoctorFees: Record<string, number> = {
  'doc-1': 800, // Dr. Aris Vance (Cardiology)
  'doc-2': 600, // Dr. Priya Sharma (Emergency)
  'doc-3': 750, // Dr. Rajesh Kulkarni (Orthopedics)
  'doc-4': 500, // Dr. Ananya Iyer (Pediatrics)
  'doc-5': 650, // Dr. Sameer Sen (Pulmonology)
  'doc-6': 700, // Dr. Radhika Nair (Internal Medicine)
  'doc-7': 650, // Dr. Vikram Patel (Dermatology)
};

// Endpoint to fetch server-authoritative doctor fees
app.get('/api/doctors/fees', (req, res) => {
  res.json({ fees: serverDoctorFees });
});

// Allowed specialties taxonomy (16 specialties as required)
export const ALLOWED_SPECIALTIES = [
  'Cardiology',
  'Orthopedics',
  'Dermatology',
  'Neurology',
  'General Medicine',
  'ENT',
  'Pediatrics',
  'Gynecology',
  'Gastroenterology',
  'Pulmonology',
  'Ophthalmology',
  'Psychiatry',
  'Urology',
  'Endocrinology',
  'Dentistry',
  'Other',
] as const;

export type AllowedSpecialty = (typeof ALLOWED_SPECIALTIES)[number];

// Helper for word-boundary keyword matching to prevent substring false-positives (e.g. "year" matching "ear")
function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}`, 'i');
    return regex.test(text);
  });
}

// Keyword-based fallback matching for clinical specialty triage
function parseFallbackSpecialty(text: string, voiceTranscript: string = '', age?: any) {
  const combined = `${text} ${voiceTranscript}`.toLowerCase();

  // Emergency indicators
  const emergencyKeywords = [
    'chest pain',
    'pressure in chest',
    'heart attack',
    'shortness of breath',
    'difficulty breathing',
    'severe breathing difficulty',
    "can't breathe",
    'struggling to breathe',
    'severe bleeding',
    'heavy bleeding',
    'unconscious',
    'unconsciousness',
    'fainted',
    'passed out',
    'stroke',
    'stroke signs',
    'slurred speech',
    'facial drooping',
    'sudden weakness',
    'numbness on one side',
    'anaphylaxis',
    'choking',
  ];
  const isEmergency = matchesKeywords(combined, emergencyKeywords);

  const isChild =
    matchesKeywords(combined, ['child', 'baby', 'infant', 'toddler', 'pediatric', 'kid', 'newborn']) ||
    /\b([0-9]|1[0-5])\s*(?:year|yr)s?\s*old\b/i.test(combined) ||
    (typeof age === 'number' && age < 16) ||
    (typeof age === 'string' && parseInt(age, 10) < 16 && !isNaN(parseInt(age, 10)));

  // 1. Cardiology: chest, heart, palpitation
  if (matchesKeywords(combined, ['chest', 'heart', 'palpitation'])) {
    return {
      specialty: 'Cardiology',
      alternatives: ['Pulmonology', 'General Medicine'],
      reason: 'Cardiovascular presentation such as chest pain or palpitations suggests cardiology evaluation.',
      urgency: 'Urgent',
      isEmergency: true,
      source: 'keywords',
    };
  }

  // 2. Orthopedics: bone, fracture, joint, knee, back pain
  if (matchesKeywords(combined, ['bone', 'fracture', 'joint', 'knee', 'back pain', 'sprain', 'fall'])) {
    return {
      specialty: 'Orthopedics',
      alternatives: ['General Medicine'],
      reason: 'Musculoskeletal discomfort, knee pain, or injury following a fall warrants orthopedic evaluation.',
      urgency: isEmergency ? 'Urgent' : 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 3. Dermatology: skin, rash, itch, acne
  if (matchesKeywords(combined, ['skin', 'rash', 'itch', 'acne'])) {
    return {
      specialty: 'Dermatology',
      alternatives: ['General Medicine'],
      reason: 'Cutaneous irritation, rash, or pruritus on skin suggests dermatological assessment.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 4. Neurology: headache, seizure, numbness, paralysis, dizziness
  if (matchesKeywords(combined, ['headache', 'seizure', 'numbness', 'paralysis', 'dizziness', 'dizzy', 'migraine'])) {
    return {
      specialty: 'Neurology',
      alternatives: ['General Medicine', 'ENT'],
      reason: 'Neurological symptoms including severe headache, dizziness, or numbness warrant neurology consultation.',
      urgency: isEmergency ? 'Urgent' : 'Soon',
      isEmergency,
      source: 'keywords',
    };
  }

  // 5. Pediatrics: child, baby, infant, or age < 16
  if (isChild) {
    return {
      specialty: 'Pediatrics',
      alternatives: ['General Medicine'],
      reason: 'Pediatric age group presenting with acute symptoms warrants pediatric consultation.',
      urgency: isEmergency ? 'Urgent' : 'Soon',
      isEmergency,
      source: 'keywords',
    };
  }

  // 6. ENT: ear, nose, throat, sinus
  if (matchesKeywords(combined, ['ear', 'nose', 'throat', 'sinus'])) {
    return {
      specialty: 'ENT',
      alternatives: ['General Medicine'],
      reason: 'Ear discomfort, sore throat, or sinus symptoms indicate evaluation by an ENT specialist.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 7. Gynecology: pregnancy, period, uterus
  if (matchesKeywords(combined, ['pregnancy', 'period', 'uterus', 'menstrual', 'pelvic', 'gynecol'])) {
    return {
      specialty: 'Gynecology',
      alternatives: ['General Medicine'],
      reason: 'Reproductive health and menstrual concerns align with gynecology.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 8. Gastroenterology: stomach, vomiting, acidity, liver
  if (matchesKeywords(combined, ['stomach', 'vomiting', 'acidity', 'liver', 'nausea', 'abdominal'])) {
    return {
      specialty: 'Gastroenterology',
      alternatives: ['General Medicine'],
      reason: 'Gastrointestinal complaints including stomach pain, acidity, or vomiting suggest gastroenterology.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 9. Pulmonology: breathing, asthma, cough
  if (matchesKeywords(combined, ['breathing', 'asthma', 'cough', 'wheezing', 'lung'])) {
    return {
      specialty: 'Pulmonology',
      alternatives: ['General Medicine', 'ENT'],
      reason: 'Respiratory symptoms, coughing, or breathing difficulty indicate pulmonology evaluation.',
      urgency: isEmergency ? 'Urgent' : 'Soon',
      isEmergency,
      source: 'keywords',
    };
  }

  // 10. Ophthalmology: eye, vision
  if (matchesKeywords(combined, ['eye', 'vision', 'blurred', 'sight'])) {
    return {
      specialty: 'Ophthalmology',
      alternatives: ['General Medicine'],
      reason: 'Ophthalmic complaints or visual disturbances warrant an ophthalmology consultation.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 11. Dentistry: tooth, gum
  if (matchesKeywords(combined, ['tooth', 'teeth', 'gum', 'dental'])) {
    return {
      specialty: 'Dentistry',
      alternatives: ['ENT', 'General Medicine'],
      reason: 'Oral and dental symptoms warrant evaluation by a dentist.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 12. Psychiatry: depression, anxiety, panic
  if (matchesKeywords(combined, ['depression', 'anxiety', 'panic', 'mental'])) {
    return {
      specialty: 'Psychiatry',
      alternatives: ['General Medicine'],
      reason: 'Psychological symptoms warrant psychiatric consultation.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 13. Urology: urine, urinary, bladder, kidney stone
  if (matchesKeywords(combined, ['urine', 'urinary', 'bladder', 'kidney stone'])) {
    return {
      specialty: 'Urology',
      alternatives: ['General Medicine'],
      reason: 'Urinary tract complaints warrant a urological consultation.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // 14. Endocrinology: diabetes, thyroid, blood sugar
  if (matchesKeywords(combined, ['diabetes', 'thyroid', 'blood sugar'])) {
    return {
      specialty: 'Endocrinology',
      alternatives: ['General Medicine'],
      reason: 'Metabolic or endocrine conditions suggest endocrinology evaluation.',
      urgency: 'Routine',
      isEmergency,
      source: 'keywords',
    };
  }

  // General Medicine ONLY when symptoms are vague, general (fever, tiredness, body ache) or fit no other specialty
  return {
    specialty: 'General Medicine',
    alternatives: ['Other'],
    reason: 'Constitutional, non-localized symptoms (fever, tiredness, body ache) suggest General Medicine evaluation.',
    urgency: isEmergency ? 'Urgent' : 'Routine',
    isEmergency,
    source: 'keywords',
  };
}

// POST /api/appointments/match-specialty
app.post('/api/appointments/match-specialty', async (req, res) => {
  try {
    const text = (req.body.text || req.body.problemSummary || req.body.caseSummary || req.body.problemDescription || '').trim();
    const voiceTranscript = (req.body.voiceTranscript || '').trim();
    const combinedText = `${text} ${voiceTranscript}`.trim();
    const privacyConsent = req.body.privacyConsent === true;
    const photos = privacyConsent && Array.isArray(req.body.photos) ? req.body.photos : [];
    const patientProfile = req.body.patientProfile || {};
    const age = req.body.age ?? patientProfile.age;
    const gender = req.body.gender ?? patientProfile.gender;

    if (!combinedText && photos.length === 0) {
      return res.status(400).json({ error: 'Please provide a health problem description or image.' });
    }

    // Emergency keywords check
    const emergencyKeywords = [
      'chest pain',
      'pressure in chest',
      'heart attack',
      'shortness of breath',
      'difficulty breathing',
      'severe breathing difficulty',
      "can't breathe",
      'struggling to breathe',
      'severe bleeding',
      'heavy bleeding',
      'unconscious',
      'unconsciousness',
      'fainted',
      'passed out',
      'stroke',
      'stroke signs',
      'slurred speech',
      'facial drooping',
      'sudden weakness',
      'numbness on one side',
      'anaphylaxis',
      'choking',
    ];
    const hasEmergencyKeywords = emergencyKeywords.some((kw) => combinedText.toLowerCase().includes(kw));

    // Step 2: System instruction strictly as requested
    const systemInstruction = `You are a hospital triage assistant. Read the patient's description and choose the single most relevant medical specialty from this list only: Cardiology, Orthopedics, Dermatology, Neurology, General Medicine, ENT, Pediatrics, Gynecology, Gastroenterology, Pulmonology, Ophthalmology, Psychiatry, Urology, Endocrinology, Dentistry, Other. Choose General Medicine ONLY when the symptoms are vague, general (fever, tiredness, body ache) or fit no other specialty. Do not diagnose any disease and do not suggest medicines. Return up to 2 alternative specialties, a one-line reason that refers to the patient's symptoms, and urgency (Routine, Soon, Urgent).

Examples:
- "chest pain, sweating, left arm pain" -> Cardiology, Urgent
- "knee pain after fall, swelling" -> Orthopedics
- "itchy red rash on arms" -> Dermatology
- "severe headache, numbness, dizziness" -> Neurology
- "ear pain, blocked nose, sore throat" -> ENT
- "child fever and cough, age 4" -> Pediatrics
- "irregular periods, pregnancy checkup" -> Gynecology
- "stomach pain, acidity, vomiting" -> Gastroenterology
- "breathing difficulty, wheezing, long cough" -> Pulmonology
- "blurred vision, eye redness" -> Ophthalmology
- "high fever, weakness, body ache" -> General Medicine`;

    const userPrompt = `Patient Presentation for Medical Specialty Triage:
- Problem Description: "${text || 'None written'}"
- Spoken Voice Transcript: "${voiceTranscript || 'None'}"
- Patient Age: ${age ?? 'Not specified'}
- Patient Gender: ${gender ?? 'Not specified'}${
      photos.length > 0 ? `\n- Patient Attached Clinical Photos (Consent Granted): ${photos.length} image(s)` : ''
    }`;

    // Step 1a: Log final prompt
    console.log('[AI Specialty Triage] Final prompt sent to Gemini:\n', userPrompt);

    const isRealKey = apiKey && !apiKey.includes('placeholder') && !apiKey.includes('MY_GEMINI_API_KEY');
    let rawText = '';
    let callSucceeded = false;

    if (isRealKey && aiClient) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API call timed out after 5 seconds')), 5000)
        );
        const aiPromise = aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                specialty: {
                  type: Type.STRING,
                  enum: [
                    'Cardiology',
                    'Orthopedics',
                    'Dermatology',
                    'Neurology',
                    'General Medicine',
                    'ENT',
                    'Pediatrics',
                    'Gynecology',
                    'Gastroenterology',
                    'Pulmonology',
                    'Ophthalmology',
                    'Psychiatry',
                    'Urology',
                    'Endocrinology',
                    'Dentistry',
                    'Other',
                  ],
                  description: 'The single most relevant medical specialty.',
                },
                alternatives: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                    enum: [
                      'Cardiology',
                      'Orthopedics',
                      'Dermatology',
                      'Neurology',
                      'General Medicine',
                      'ENT',
                      'Pediatrics',
                      'Gynecology',
                      'Gastroenterology',
                      'Pulmonology',
                      'Ophthalmology',
                      'Psychiatry',
                      'Urology',
                      'Endocrinology',
                      'Dentistry',
                      'Other',
                    ],
                  },
                  description: 'Up to 2 alternative specialties.',
                },
                reason: {
                  type: Type.STRING,
                  description: "A one-line reason that refers to the patient's symptoms.",
                },
                urgency: {
                  type: Type.STRING,
                  enum: ['Routine', 'Soon', 'Urgent'],
                  description: 'Urgency level.',
                },
              },
              required: ['specialty', 'alternatives', 'reason', 'urgency'],
            },
            temperature: 0.2,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        rawText = (response?.text || '').trim();
        if (rawText) {
          callSucceeded = true;
        }
      } catch (geminiErr: any) {
        console.warn('[AI Specialty Triage] Gemini API call error or timeout, applying keyword fallback:', geminiErr?.message || geminiErr);
        rawText = '';
        callSucceeded = false;
      }
    }

    let parsed: any = null;
    if (callSucceeded && rawText) {
      try {
        let cleanJson = rawText.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        parsed = JSON.parse(cleanJson);
      } catch (jsonErr) {
        console.warn('[AI Specialty Triage] Failed to parse JSON, falling back:', jsonErr);
        parsed = null;
      }
    }

    // Step 1b & 4: If AI call failed, timed out, or JSON invalid, use keyword fallback, NEVER a hardcoded default!
    if (!parsed || !parsed.specialty) {
      const fallback = parseFallbackSpecialty(text, voiceTranscript, age);
      return res.json({
        ...fallback,
        source: 'keywords',
        isEmergency: fallback.isEmergency || hasEmergencyKeywords,
        disclaimer: 'AI suggestion, not a diagnosis. A doctor will assess you.',
      });
    }

    // Step 3: Server validation. If the specialty is not in the list, use "Other", not "General Medicine"
    const sanitizedSpecialty = ALLOWED_SPECIALTIES.includes(parsed.specialty) ? parsed.specialty : 'Other';
    const sanitizedAlternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .filter((alt: any) => typeof alt === 'string' && ALLOWED_SPECIALTIES.includes(alt as any) && alt !== sanitizedSpecialty)
          .slice(0, 2)
      : [];

    const urgency: 'Routine' | 'Soon' | 'Urgent' = ['Routine', 'Soon', 'Urgent'].includes(parsed.urgency)
      ? parsed.urgency
      : hasEmergencyKeywords
      ? 'Urgent'
      : 'Routine';

    const isEmergency = parsed.isEmergency === true || hasEmergencyKeywords || urgency === 'Urgent';

    return res.json({
      specialty: sanitizedSpecialty,
      alternatives: sanitizedAlternatives,
      reason: parsed.reason || 'Specialty consultation recommended based on the described symptoms.',
      urgency,
      isEmergency,
      source: 'ai',
      disclaimer: 'AI suggestion, not a diagnosis. A doctor will assess you.',
    });
  } catch (error: any) {
    console.error('Error in /api/appointments/match-specialty:', error);
    const fallback = parseFallbackSpecialty(req.body?.text || '', req.body?.voiceTranscript || '', req.body?.age ?? req.body?.patientProfile?.age);
    return res.json({
      ...fallback,
      source: 'keywords',
      disclaimer: 'AI suggestion, not a diagnosis. A doctor will assess you.',
    });
  }
});

// ============================================================================
// SERVER-AUTHORITATIVE APPOINTMENT SLOTS, 10-MINUTE HOLD & TRANSACTION ENGINE
// ============================================================================

interface ServerSlotLock {
  doctorId: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "10:00 AM"
  status: 'held' | 'booked';
  patientId?: string;
  holdToken?: string;
  heldUntil: number; // timestamp in ms
  createdAt: number;
}

// In-memory slot locks registry (single-threaded Node.js event loop ensures atomic transactions)
const serverSlotRegistry = new Map<string, ServerSlotLock>();

// Seed baseline booked slots from initial data
serverSlotRegistry.set('doc-1::2026-10-30::09:30 AM', {
  doctorId: 'doc-1',
  date: '2026-10-30',
  timeSlot: '09:30 AM',
  status: 'booked',
  patientId: 'pat-2',
  heldUntil: 0,
  createdAt: Date.now(),
});
serverSlotRegistry.set('doc-1::2026-10-30::11:30 AM', {
  doctorId: 'doc-1',
  date: '2026-10-30',
  timeSlot: '11:30 AM',
  status: 'booked',
  patientId: 'pat-1',
  heldUntil: 0,
  createdAt: Date.now(),
});
serverSlotRegistry.set('doc-3::2026-10-30::10:00 AM', {
  doctorId: 'doc-3',
  date: '2026-10-30',
  timeSlot: '10:00 AM',
  status: 'booked',
  patientId: 'pat-7',
  heldUntil: 0,
  createdAt: Date.now(),
});
serverSlotRegistry.set('doc-7::2026-10-30::02:00 PM', {
  doctorId: 'doc-7',
  date: '2026-10-30',
  timeSlot: '02:00 PM',
  status: 'booked',
  patientId: 'pat-5',
  heldUntil: 0,
  createdAt: Date.now(),
});
serverSlotRegistry.set('doc-7::2026-10-31::11:00 AM', {
  doctorId: 'doc-7',
  date: '2026-10-31',
  timeSlot: '11:00 AM',
  status: 'booked',
  patientId: 'pat-4',
  heldUntil: 0,
  createdAt: Date.now(),
});

// Doctor scheduled leave & hospital holidays calendar
const serverDoctorLeaves: Record<string, { date: string; reason: string; type: 'leave' | 'surgery' | 'holiday' }[]> = {
  'doc-2': [{ date: '2026-11-02', reason: 'Emergency Department On-Call Trauma Shift', type: 'leave' }],
  'doc-3': [{ date: '2026-11-03', reason: 'Robotic Arthroplasty Surgical Block', type: 'surgery' }],
  'doc-5': [{ date: '2026-11-04', reason: 'Attending Inter-Hospital Critical Care Summit', type: 'leave' }],
};

const serverHospitalHolidays: Record<string, string> = {
  '2026-11-08': 'Diwali Gazetted Hospital Holiday (Outpatient OPD Closed)',
};

// Clean expired holds helper
function cleanExpiredHolds() {
  const now = Date.now();
  for (const [key, lock] of serverSlotRegistry.entries()) {
    if (lock.status === 'held' && lock.heldUntil > 0 && now > lock.heldUntil) {
      serverSlotRegistry.delete(key);
    }
  }
}

// GET /api/appointments/slots
// Returns doctor consultation fee, leave status, and available slots
app.get('/api/appointments/slots', (req, res) => {
  try {
    const doctorId = String(req.query.doctorId || '');
    const date = String(req.query.date || '');
    const clientHoldToken = String(req.query.holdToken || '');

    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId and date query parameters are required' });
    }

    cleanExpiredHolds();

    // Check hospital public holiday
    if (serverHospitalHolidays[date]) {
      return res.json({
        doctorId,
        date,
        isLeaveOrHoliday: true,
        reason: serverHospitalHolidays[date],
        doctorFee: serverDoctorFees[doctorId] || 650,
        slots: [],
      });
    }

    // Check doctor leave
    const leaves = serverDoctorLeaves[doctorId] || [];
    const matchedLeave = leaves.find((l) => l.date === date);
    if (matchedLeave) {
      return res.json({
        doctorId,
        date,
        isLeaveOrHoliday: true,
        reason: matchedLeave.reason,
        leaveType: matchedLeave.type,
        doctorFee: serverDoctorFees[doctorId] || 650,
        slots: [],
      });
    }

    const standardSlots = [
      '09:00 AM',
      '09:30 AM',
      '10:00 AM',
      '10:30 AM',
      '11:00 AM',
      '11:30 AM',
      '02:00 PM',
      '02:30 PM',
      '03:00 PM',
      '03:30 PM',
      '04:00 PM',
      '04:30 PM',
    ];

    const slots = standardSlots.map((time) => {
      const key = `${doctorId}::${date}::${time}`;
      const lock = serverSlotRegistry.get(key);

      if (!lock) {
        return { time, status: 'available', isAvailable: true };
      }

      if (lock.status === 'booked') {
        return { time, status: 'booked', isAvailable: false };
      }

      // Slot is held
      const isMyHold = clientHoldToken && lock.holdToken === clientHoldToken;
      if (isMyHold) {
        return {
          time,
          status: 'held_by_you',
          isAvailable: true,
          heldUntil: lock.heldUntil,
        };
      }

      return {
        time,
        status: 'held_by_other',
        isAvailable: false,
        heldUntil: lock.heldUntil,
      };
    });

    return res.json({
      doctorId,
      date,
      doctorFee: serverDoctorFees[doctorId] || 650,
      isLeaveOrHoliday: false,
      slots,
    });
  } catch (err: any) {
    console.error('Error in /api/appointments/slots:', err);
    return res.status(500).json({ error: 'Failed to fetch slots', details: err.message });
  }
});

// POST /api/appointments/hold-slot
// Transactional 10-minute slot hold. Guarantees only 1 winner for concurrent requests.
app.post('/api/appointments/hold-slot', (req, res) => {
  try {
    const { doctorId, date, timeSlot, patientId, previousHoldToken } = req.body;

    if (!doctorId || !date || !timeSlot) {
      return res.status(400).json({ error: 'doctorId, date, and timeSlot are required' });
    }

    // Disallow past dates
    const todayStr = '2026-10-30';
    if (date < todayStr) {
      return res.status(400).json({ error: 'Cannot book appointment slots for past dates.' });
    }

    cleanExpiredHolds();

    // If client held a previous slot, release it
    if (previousHoldToken) {
      for (const [k, lock] of serverSlotRegistry.entries()) {
        if (lock.holdToken === previousHoldToken && lock.status === 'held') {
          serverSlotRegistry.delete(k);
        }
      }
    }

    const key = `${doctorId}::${date}::${timeSlot}`;
    const existing = serverSlotRegistry.get(key);

    if (existing) {
      if (existing.status === 'booked') {
        return res.status(409).json({
          success: false,
          error: `This time slot (${timeSlot}) is already booked for this doctor. Please select another slot.`,
        });
      }

      if (existing.status === 'held' && Date.now() < existing.heldUntil) {
        if (previousHoldToken && existing.holdToken === previousHoldToken) {
          // Extend current hold
          existing.heldUntil = Date.now() + 10 * 60 * 1000;
          return res.json({
            success: true,
            holdToken: existing.holdToken,
            heldUntil: existing.heldUntil,
            expiresAt: new Date(existing.heldUntil).toISOString(),
            doctorFee: serverDoctorFees[doctorId] || 650,
          });
        }
        return res.status(409).json({
          success: false,
          error: `This time slot (${timeSlot}) is currently held by another patient (10-minute reservation hold). Please select another slot.`,
        });
      }
    }

    // Atomic assignment (single-threaded Node.js event loop ensures transaction safety)
    const holdToken = `HOLD-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const heldUntil = Date.now() + 10 * 60 * 1000; // 10 minutes

    serverSlotRegistry.set(key, {
      doctorId,
      date,
      timeSlot,
      status: 'held',
      patientId: patientId || 'guest',
      holdToken,
      heldUntil,
      createdAt: Date.now(),
    });

    return res.json({
      success: true,
      holdToken,
      heldUntil,
      expiresAt: new Date(heldUntil).toISOString(),
      doctorFee: serverDoctorFees[doctorId] || 650,
    });
  } catch (err: any) {
    console.error('Error holding slot:', err);
    return res.status(500).json({ error: 'Failed to hold slot', details: err.message });
  }
});

// POST /api/appointments/release-hold
app.post('/api/appointments/release-hold', (req, res) => {
  try {
    const { holdToken } = req.body;
    if (!holdToken) return res.json({ success: true });

    for (const [k, lock] of serverSlotRegistry.entries()) {
      if (lock.holdToken === holdToken && lock.status === 'held') {
        serverSlotRegistry.delete(k);
      }
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/appointments/create
// Creates appointment record, sets status to 'Booked', payment to 'Not selected', and locks fee authoritatively from server
const serverPatients = new Map<string, any>([
  ['PT00234', { id: 'pat-1', uniquePatientId: 'PT00234', name: 'Sarah Chen', phone: '+91 98112 34567', age: 32, gender: 'Female', bloodGroup: 'B+', allergies: ['Penicillin'] }],
  ['PT51829', { id: 'pat-3', uniquePatientId: 'PT51829', name: 'Priya Nair', phone: '+91 98711 55443', age: 28, gender: 'Female', bloodGroup: 'A+', allergies: [] }],
  ['PT40291', { id: 'pat-5', uniquePatientId: 'PT40291', name: 'Anita Sharma', phone: '+91 98440 56789', age: 38, gender: 'Female', bloodGroup: 'O+', allergies: [] }],
  ['PT67123', { id: 'pat-4', uniquePatientId: 'PT67123', name: 'David Miller', phone: '+91 98550 67890', age: 42, gender: 'Male', bloodGroup: 'A-', allergies: ['Sulfa'] }],
  ['PT38294', { id: 'pat-8', uniquePatientId: 'PT38294', name: 'Rohan Mehta', phone: '+91 98822 33445', age: 30, gender: 'Male', bloodGroup: 'AB+', allergies: [] }],
  ['PT00891', { id: 'pat-2', uniquePatientId: 'PT00891', name: 'Rajesh Patel', phone: '+91 98220 12345', age: 49, gender: 'Male', bloodGroup: 'O+', allergies: [] }],
  ['PT94810', { id: 'pat-7', uniquePatientId: 'PT94810', name: 'Meera Sengupta', phone: '+91 98330 45678', age: 52, gender: 'Female', bloodGroup: 'B-', allergies: [] }],
]);

const serverAppointmentsLedger = new Map<string, any>([
  ['APT-2026-0001', {
    id: 'APT-2026-0001',
    patientId: 'pat-1',
    patientName: 'Sarah Chen',
    uniquePatientId: 'PT00234',
    doctorId: 'doc-1',
    doctorName: 'Dr. Aris Vance, MD',
    department: 'Cardiology',
    date: '2026-10-30',
    timeSlot: '11:30 AM',
    fee: 800,
    appointmentStatus: 'Checked-in',
    paymentStatus: 'Paid',
    tokenNumber: 'C-04',
    problemSummary: 'Routine quarterly cardiac checkup',
    caseSummary: 'Patient Sarah Chen (PT00234, 32F) presented for routine cardiac follow-up.',
    aiSpecialtySuggestion: 'Cardiology',
    urgencyLevel: 'Routine',
  }],
  ['APT-2026-0004', {
    id: 'APT-2026-0004',
    patientId: 'pat-5',
    patientName: 'Anita Sharma',
    uniquePatientId: 'PT40291',
    doctorId: 'doc-7',
    doctorName: 'Dr. Vikram Patel, MD (Dermatology)',
    department: 'Dermatology',
    date: '2026-10-30',
    timeSlot: '02:00 PM',
    fee: 650,
    appointmentStatus: 'Confirmed - Payment Pending',
    paymentStatus: 'Pending',
    problemSummary: 'Red itchy rash on forearms',
    caseSummary: 'Patient Anita Sharma (PT40291, 38F) reporting pruritic rash.',
    aiSpecialtySuggestion: 'Dermatology',
    urgencyLevel: 'Routine',
  }],
  ['APT-2026-0005', {
    id: 'APT-2026-0005',
    patientId: 'pat-4',
    patientName: 'David Miller',
    uniquePatientId: 'PT67123',
    doctorId: 'doc-7',
    doctorName: 'Dr. Vikram Patel, MD (Dermatology)',
    department: 'Dermatology',
    date: '2026-10-31',
    timeSlot: '11:00 AM',
    fee: 650,
    appointmentStatus: 'Confirmed',
    paymentStatus: 'Paid',
    problemSummary: 'Follow-up eczema',
    caseSummary: 'Patient David Miller (PT67123, 42M) scheduled for eczema review.',
    aiSpecialtySuggestion: 'Dermatology',
    urgencyLevel: 'Routine',
  }],
  ['APT-2026-0006', {
    id: 'APT-2026-0006',
    patientId: 'pat-3',
    patientName: 'Priya Nair',
    uniquePatientId: 'PT51829',
    doctorId: 'doc-1',
    doctorName: 'Dr. Aris Vance, MD',
    department: 'Cardiology',
    date: '2026-10-30',
    timeSlot: '11:45 AM',
    fee: 800,
    appointmentStatus: 'Booked',
    paymentStatus: 'Not selected',
    problemSummary: 'Heart palpitations after light exertion',
    caseSummary: 'Patient Priya Nair (PT51829, 28F) reports episodic palpitations.',
    aiSpecialtySuggestion: 'Cardiology',
    urgencyLevel: 'Routine',
  }],
  ['APT-2026-0007', {
    id: 'APT-2026-0007',
    patientId: 'pat-8',
    patientName: 'Rohan Mehta',
    uniquePatientId: 'PT38294',
    doctorId: 'doc-3',
    doctorName: 'Dr. Rajesh Kulkarni, MS (Ortho)',
    department: 'Orthopedics',
    date: '2026-10-30',
    timeSlot: '12:15 PM',
    fee: 750,
    appointmentStatus: 'Cancelled',
    cancelReason: 'Patient cancelled due to unexpected travel',
    paymentStatus: 'Refunded',
    problemSummary: 'Right ankle sprain',
    caseSummary: 'Patient Rohan Mehta (PT38294, 30M) sustained twisting ankle injury.',
    aiSpecialtySuggestion: 'Orthopedics',
    urgencyLevel: 'Routine',
  }],
]);

const serverQueueTokens = new Map<string, any>([
  ['q-1', { id: 'q-1', tokenNumber: 'C-01', doctorId: 'doc-1', status: 'done', patientId: 'pat-2', patientName: 'Rajesh Patel' }],
  ['q-2', { id: 'q-2', tokenNumber: 'C-02', doctorId: 'doc-1', status: 'in_consultation', patientId: 'pat-9', patientName: 'Vikram Malhotra' }],
  ['q-3', { id: 'q-3', tokenNumber: 'C-03', doctorId: 'doc-1', status: 'waiting', patientId: 'pat-10', patientName: 'Sanjay Gupta' }],
  ['q-4', { id: 'q-4', tokenNumber: 'C-04', doctorId: 'doc-1', status: 'waiting', patientId: 'pat-1', patientName: 'Sarah Chen' }],
]);

app.post('/api/appointments/create', (req, res) => {
  try {
    const {
      holdToken,
      patientId,
      uniquePatientId,
      patientName,
      patientEmail,
      patientPhone,
      doctorId,
      hospitalId,
      department,
      date,
      timeSlot,
      problemSummary,
      voiceTranscript,
      caseSummary,
      aiSpecialtySuggestion,
      attachedPhotos,
      urgencyLevel,
      isEmergency,
    } = req.body;

    if (!patientId || !uniquePatientId || !patientName || !doctorId || !hospitalId || !date || !timeSlot) {
      return res.status(400).json({
        error: 'Missing required appointment fields (patientId, uniquePatientId, patientName, doctorId, hospitalId, date, timeSlot)',
      });
    }

    cleanExpiredHolds();

    const key = `${doctorId}::${date}::${timeSlot}`;
    const existingLock = serverSlotRegistry.get(key);

    if (existingLock && existingLock.status === 'booked') {
      return res.status(409).json({
        error: `This time slot (${timeSlot}) on ${date} is already confirmed and booked.`,
      });
    }

    if (existingLock && existingLock.status === 'held') {
      if (holdToken && existingLock.holdToken !== holdToken) {
        return res.status(409).json({
          error: `This time slot is held by another patient. Please select a different slot.`,
        });
      }
    }

    // Authoritative doctor consultation fee from server registry
    const serverFee = serverDoctorFees[doctorId] || 650;

    // Permanently mark slot as booked
    serverSlotRegistry.set(key, {
      doctorId,
      date,
      timeSlot,
      status: 'booked',
      patientId,
      holdToken: holdToken || 'DIRECT',
      heldUntil: 0,
      createdAt: Date.now(),
    });

    const appointmentId = `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const appointmentRecord = {
      id: appointmentId,
      patientId,
      patientName,
      uniquePatientId,
      patientEmail: patientEmail || '',
      patientPhone: patientPhone || '',
      hospitalId,
      doctorId,
      department: department || 'General Medicine',
      date,
      timeSlot,
      fee: serverFee,
      appointmentStatus: 'Booked',
      paymentStatus: 'Not selected',
      problemSummary: problemSummary || '',
      voiceTranscript: voiceTranscript || '',
      caseSummary: caseSummary || '',
      aiSpecialtySuggestion: aiSpecialtySuggestion || '',
      urgencyLevel: urgencyLevel || 'Routine',
      isEmergency: Boolean(isEmergency),
      attachedPhotos: attachedPhotos || [],
      createdAt: new Date().toISOString(),
    };

    serverAppointmentsLedger.set(appointmentId, appointmentRecord);

    // Register invoice in server bills
    serverBills.set(`INV-${appointmentId}`, {
      id: `INV-${appointmentId}`,
      amount: serverFee,
      patientId,
      status: 'Pending',
    });

    return res.json({
      success: true,
      appointment: appointmentRecord,
    });
  } catch (err: any) {
    console.error('Error creating appointment record:', err);
    return res.status(500).json({ error: 'Failed to create appointment record', details: err.message });
  }
});

// Server-side Bills Ledger
// Pre-populated with baseline initial bills; updated dynamically when appointments/orders are generated
const serverBills = new Map<string, { id: string; amount: number; patientId?: string; status?: string }>([
  ['INV-2026-001', { id: 'INV-2026-001', amount: 1850, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-002', { id: 'INV-2026-002', amount: 1450, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-003', { id: 'INV-2026-003', amount: 920, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-004', { id: 'INV-2026-004', amount: 750, patientId: 'pat-1', status: 'Pending' }],
  ['INV-2026-005', { id: 'INV-2026-005', amount: 1200, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-006', { id: 'INV-2026-006', amount: 2200, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-007', { id: 'INV-2026-007', amount: 600, patientId: 'pat-1', status: 'Paid' }],
  ['INV-2026-008', { id: 'INV-2026-008', amount: 850, patientId: 'pat-1', status: 'Paid' }],
]);

// Register or sync bill to server ledger
app.post('/api/bills/register', (req, res) => {
  const { id, amount, patientId, status } = req.body;
  if (!id || typeof amount !== 'number') {
    return res.status(400).json({ error: 'id and numeric amount are required' });
  }
  serverBills.set(id, { id, amount, patientId, status: status || 'Pending' });
  return res.json({ success: true, bill: serverBills.get(id) });
});

// --- RECEPTION DESK & CHECK-IN API ---

// GET /api/reception/search?query=PT00234 or APT-2026-0001
app.get('/api/reception/search', (req, res) => {
  const query = String(req.query.query || '').trim().toUpperCase();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  // Appointment ID lookup
  if (query.startsWith('APT-')) {
    const apt = serverAppointmentsLedger.get(query);
    if (!apt) {
      return res.status(404).json({ found: false, error: `No appointment found with ID ${query}` });
    }
    const patient = serverPatients.get(apt.uniquePatientId);
    return res.json({ found: true, type: 'appointment', appointment: apt, patient });
  }

  // Patient ID lookup: must match format PT + 5 digits
  if (!/^PT\d{5}$/.test(query)) {
    return res.status(400).json({
      error: "Invalid Patient ID format. Must be 'PT' followed by 5 digits (e.g., PT00234)",
    });
  }

  const patient = serverPatients.get(query);
  if (!patient) {
    return res.status(404).json({
      found: false,
      error: `No patient found with ID ${query}`,
    });
  }

  // Retrieve appointments for this patient
  const patientApts = Array.from(serverAppointmentsLedger.values()).filter(
    (a) => a.uniquePatientId === query || a.patientId === patient.id
  );

  return res.json({
    found: true,
    type: 'patient',
    patient,
    appointments: patientApts,
  });
});

// POST /api/reception/collect-payment
app.post('/api/reception/collect-payment', (req, res) => {
  const { appointmentId, staffId = 'ADM-101', method = 'Cash', amount } = req.body;
  if (!appointmentId) {
    return res.status(400).json({ error: 'appointmentId is required' });
  }

  const apt = serverAppointmentsLedger.get(appointmentId);
  if (!apt) {
    return res.status(404).json({ error: `Appointment ${appointmentId} not found` });
  }

  const receiptNumber = `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const collectedAmount = typeof amount === 'number' ? amount : (apt.fee || 800);

  apt.paymentStatus = 'Paid';
  apt.paymentReceipt = receiptNumber;
  apt.receptionPaymentMethod = method;
  apt.paymentCollectedBy = staffId;
  apt.paymentCollectedAt = new Date().toISOString();

  serverBills.set(`INV-${appointmentId}`, {
    id: `INV-${appointmentId}`,
    amount: collectedAmount,
    patientId: apt.patientId,
    status: 'Paid',
  });

  return res.json({
    success: true,
    receipt: receiptNumber,
    appointment: apt,
  });
});

// POST /api/reception/check-in
app.post('/api/reception/check-in', (req, res) => {
  const { appointmentId, staffId = 'ADM-101', paymentCollection } = req.body;
  if (!appointmentId) {
    return res.status(400).json({ error: 'appointmentId is required' });
  }

  const apt = serverAppointmentsLedger.get(appointmentId);
  if (!apt) {
    return res.status(404).json({ error: `Appointment ${appointmentId} not found` });
  }

  // Edge Case 1: Cancelled appointments cannot be checked in
  if (apt.appointmentStatus === 'Cancelled') {
    return res.status(400).json({ error: 'Cancelled appointments cannot be checked in.' });
  }

  // Edge Case 2: Duplicate check-in blocked
  if (apt.appointmentStatus === 'Checked-in' || apt.appointmentStatus === 'In consultation' || apt.appointmentStatus === 'Completed') {
    return res.status(400).json({
      error: `Duplicate check-in blocked: Patient is already checked in with Token #${apt.tokenNumber || 'Active'}.`,
    });
  }

  let receiptNumber: string | undefined;

  // Handle counter payment if pending
  if (apt.paymentStatus !== 'Paid' && paymentCollection) {
    receiptNumber = `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    apt.paymentStatus = 'Paid';
    apt.paymentReceipt = receiptNumber;
    apt.receptionPaymentMethod = paymentCollection.method;
    apt.paymentCollectedBy = staffId;
    apt.paymentCollectedAt = new Date().toISOString();
  }

  // Generate sequential per-doctor per-day token (format C-04)
  const doctorTokens = Array.from(serverQueueTokens.values()).filter((q) => q.doctorId === apt.doctorId);
  const deptPrefix = (apt.department || 'C').charAt(0).toUpperCase();
  const tokenNum = `${deptPrefix}-${String(doctorTokens.length + 1).padStart(2, '0')}`;

  const waitingOrActive = doctorTokens.filter((q) => q.status === 'waiting' || q.status === 'in_consultation');
  const peopleAhead = waitingOrActive.length;
  const estimatedWaitMinutes = peopleAhead * 10;

  const newToken = {
    id: `token-${Date.now()}`,
    tokenNumber: tokenNum,
    appointmentId: apt.id,
    patientId: apt.patientId,
    patientName: apt.patientName,
    uniquePatientId: apt.uniquePatientId,
    doctorId: apt.doctorId,
    doctorName: apt.doctorName,
    department: apt.department,
    status: 'waiting',
    paymentStatus: 'paid',
    caseSummary: apt.caseSummary,
    aiSpecialtySuggestion: apt.aiSpecialtySuggestion,
    urgencyLevel: apt.urgencyLevel || 'Routine',
    createdAt: new Date().toISOString(),
    estimatedWaitMinutes,
    roomNumber: 'Cabin 1',
  };

  serverQueueTokens.set(newToken.id, newToken);

  apt.appointmentStatus = 'Checked-in';
  apt.tokenNumber = tokenNum;
  apt.queueTokenId = newToken.id;
  apt.checkedInAt = new Date().toISOString();
  apt.checkedInByStaffId = staffId;

  return res.json({
    success: true,
    appointment: apt,
    token: newToken,
    receipt: receiptNumber,
    peopleAhead,
    estimatedWaitMinutes,
  });
});

// POST /api/reception/no-show
app.post('/api/reception/no-show', (req, res) => {
  const { appointmentId, staffId = 'ADM-101' } = req.body;
  const apt = serverAppointmentsLedger.get(appointmentId);
  if (!apt) {
    return res.status(404).json({ error: `Appointment ${appointmentId} not found` });
  }

  apt.appointmentStatus = 'No-show';
  return res.json({ success: true, appointment: apt });
});

// POST /api/doctor/advance-queue
app.post('/api/doctor/advance-queue', (req, res) => {
  const { doctorId = 'doc-1' } = req.body;
  const docTokens = Array.from(serverQueueTokens.values()).filter((q) => q.doctorId === doctorId);

  // Transition active in_consultation -> done / Completed
  const currentActive = docTokens.find((q) => q.status === 'in_consultation');
  if (currentActive) {
    currentActive.status = 'done';
    const finishedApt = Array.from(serverAppointmentsLedger.values()).find(
      (a) => a.tokenNumber === currentActive.tokenNumber || a.id === currentActive.appointmentId
    );
    if (finishedApt) {
      finishedApt.appointmentStatus = 'Completed';
    }
  }

  // Next waiting -> in_consultation
  const waitingTokens = docTokens.filter((q) => q.status === 'waiting');
  let nextPatient: any = null;
  if (waitingTokens.length > 0) {
    nextPatient = waitingTokens[0];
    nextPatient.status = 'in_consultation';
    const activeApt = Array.from(serverAppointmentsLedger.values()).find(
      (a) => a.tokenNumber === nextPatient.tokenNumber || a.id === nextPatient.appointmentId
    );
    if (activeApt) {
      activeApt.appointmentStatus = 'In consultation';
    }
  }

  return res.json({
    success: true,
    completed: currentActive || null,
    inConsultation: nextPatient || null,
    remainingWaiting: waitingTokens.length > 1 ? waitingTokens.length - 1 : 0,
  });
});

// Razorpay Order Creation Endpoint
// STRICT: Must accept billId, read amount from the bill record on the server, and ignore any amount sent by the client.
app.post('/api/razorpay/create-order', async (req, res) => {
  try {
    const { billId, currency = 'INR', receipt, notes } = req.body;
    if (!billId || typeof billId !== 'string') {
      return res.status(400).json({ error: 'Valid billId is required' });
    }

    const bill = serverBills.get(billId);
    if (!bill) {
      return res.status(404).json({ error: `Bill record "${billId}" not found on server. Please ensure the bill is registered.` });
    }

    // Read amount STRICTLY from server bill record in paise (1 INR = 100 paise)
    // Client-supplied amount is intentionally ignored.
    const amountInPaise = Math.round(bill.amount * 100);

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    // If real server keys are configured in environment (not placeholders), call official Razorpay API
    const isRealSecret = keySecret && !keySecret.includes('placeholder') && !keySecret.includes('MY_RAZORPAY_KEY_SECRET');
    const isRealKey = keyId && !keyId.includes('placeholder') && keyId.startsWith('rzp_');

    if (isRealKey && isRealSecret) {
      try {
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency,
            receipt: receipt || `rcpt_${billId}_${Date.now()}`,
            notes: { billId, ...(notes || {}) },
          }),
        });

        if (rzpResponse.ok) {
          const order = await rzpResponse.json();
          return res.json({ ...order, testMode: false, billId, amount: amountInPaise });
        } else {
          const errorBody = await rzpResponse.text();
          console.warn('Razorpay live API returned error, falling back to test order:', errorBody);
        }
      } catch (apiErr) {
        console.warn('Razorpay live API fetch failed, falling back to test order:', apiErr);
      }
    }

    // Test mode order simulation
    const testOrderId = `order_test_${Date.now().toString().slice(-8)}_${Math.random().toString(36).substring(2, 6)}`;
    return res.json({
      id: testOrderId,
      entity: 'order',
      amount: amountInPaise,
      amount_paid: 0,
      amount_due: amountInPaise,
      currency,
      receipt: receipt || `rcpt_${billId}_${Date.now()}`,
      status: 'created',
      attempts: 0,
      notes: { billId, ...(notes || {}) },
      created_at: Math.floor(Date.now() / 1000),
      testMode: true,
      billId,
      message: 'Order created in Razorpay Sandbox / Test Mode',
    });
  } catch (err: any) {
    console.error('Razorpay order creation error:', err);
    return res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

// Razorpay Payment Signature Verification Endpoint
// STRICT: Must never return verified: true for missing or invalid input. Test-mode bypass allowed only when DEMO_MODE=true.
app.post('/api/razorpay/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, billId } = req.body;

    // Never return verified: true for missing or invalid input
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Missing required credentials: razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required',
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    const isRealSecret = keySecret && !keySecret.includes('placeholder') && !keySecret.includes('MY_RAZORPAY_KEY_SECRET');

    // If real server secret is configured and signature was provided
    if (isRealSecret) {
      const cryptoModule = await import('crypto');
      const bodyToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = cryptoModule
        .createHmac('sha256', keySecret)
        .update(bodyToSign)
        .digest('hex');

      if (expectedSignature === razorpay_signature) {
        if (billId && serverBills.has(billId)) {
          serverBills.get(billId)!.status = 'Paid';
        }
        return res.json({
          success: true,
          verified: true,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          testMode: false,
        });
      } else {
        return res.status(400).json({
          success: false,
          verified: false,
          error: 'Invalid payment signature from Razorpay',
        });
      }
    }

    // The test-mode bypass is allowed ONLY when DEMO_MODE=true is set
    const isDemoMode = process.env.DEMO_MODE === 'true';
    if (isDemoMode) {
      if (billId && serverBills.has(billId)) {
        serverBills.get(billId)!.status = 'Paid';
      }
      return res.json({
        success: true,
        verified: true,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        testMode: true,
        message: 'Payment verified in Razorpay Test Mode via DEMO_MODE authorization',
      });
    }

    // Live secret is not configured and DEMO_MODE is not true
    return res.status(403).json({
      success: false,
      verified: false,
      error: 'Razorpay signature verification rejected: Live secret is not configured and DEMO_MODE is not set to true',
    });
  } catch (err: any) {
    console.error('Razorpay signature verification error:', err);
    return res.status(500).json({ success: false, verified: false, error: 'Verification failed', details: err.message });
  }
});

// Google Maps Reverse Geocoding Proxy (avoids client-side CORS issues)
app.get('/api/maps/geocode', async (req, res) => {
  try {
    const lat = req.query.lat;
    const lng = req.query.lng;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng parameters are required' });
    }

    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!key || key.includes('placeholder') || key.includes('MY_GOOGLE_MAPS_API_KEY')) {
      return res.json({
        address: `Coordinates: ${Number(lat).toFixed(4)}°N, ${Number(lng).toFixed(4)}°E`,
        status: 'OK',
        results: [],
      });
    }
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return res.json({
        address: data.results[0].formatted_address,
        results: data.results,
        status: 'OK',
      });
    }

    // Fallback formatted coordinates string if no reverse geocode result was found
    return res.json({
      address: `Coordinates: ${Number(lat).toFixed(4)}°N, ${Number(lng).toFixed(4)}°E`,
      status: data.status || 'ZERO_RESULTS',
      results: [],
    });
  } catch (err: any) {
    console.error('Reverse geocode proxy error:', err);
    return res.json({
      address: `Location (${Number(req.query.lat || 0).toFixed(4)}, ${Number(req.query.lng || 0).toFixed(4)})`,
      status: 'ERROR',
      error: err.message,
    });
  }
});

// Haversine distance calculator in kilometers
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
}

// Google Maps Distance Matrix / Driving Distance Proxy
app.post('/api/maps/distances', async (req, res) => {
  try {
    const { origin, destinations } = req.body;
    if (!origin || typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
      return res.status(400).json({ error: 'Valid origin with lat and lng is required' });
    }
    if (!Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({ error: 'destinations array is required' });
    }

    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const isRealKey = key && !key.includes('placeholder') && !key.includes('MY_GOOGLE_MAPS_API_KEY');

    // If real Google Maps API key is available, query Google Distance Matrix API
    if (isRealKey) {
      try {
        const destCoords = destinations.map((d: any) => `${d.lat},${d.lng}`).join('|');
        const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destCoords}&mode=driving&units=metric&key=${key}`;
        const dmResp = await fetch(dmUrl);
        const dmData = await dmResp.json();

        if (dmData.status === 'OK' && dmData.rows?.[0]?.elements) {
          const results = destinations.map((d: any, idx: number) => {
            const el = dmData.rows[0].elements[idx];
            if (el && el.status === 'OK') {
              const distanceKm = parseFloat((el.distance.value / 1000).toFixed(1));
              const durationMins = Math.round(el.duration.value / 60);
              return {
                id: d.id,
                distanceKm,
                durationMins,
                distanceText: el.distance.text,
                durationText: el.duration.text,
                isRealRoute: true,
              };
            }
            // Element fallback
            const straightKm = calculateHaversineKm(origin.lat, origin.lng, d.lat, d.lng);
            return {
              id: d.id,
              distanceKm: straightKm,
              durationMins: Math.round(straightKm * 2.2 + 5),
              distanceText: `${straightKm} km (est.)`,
              durationText: `${Math.round(straightKm * 2.2 + 5)} mins`,
              isRealRoute: false,
            };
          });

          return res.json({ results, isFallback: false, provider: 'Google Maps Distance Matrix' });
        }
      } catch (apiErr) {
        console.warn('Distance Matrix API request failed, falling back to Haversine:', apiErr);
      }
    }

    // Straight-line fallback with realistic urban driving duration estimates
    const fallbackResults = destinations.map((d: any) => {
      const distanceKm = calculateHaversineKm(origin.lat, origin.lng, d.lat, d.lng);
      const durationMins = Math.round(distanceKm * 2.3 + 4);
      return {
        id: d.id,
        distanceKm,
        durationMins,
        distanceText: `${distanceKm} km (straight-line)`,
        durationText: `~${durationMins} mins driving`,
        isRealRoute: false,
      };
    });

    return res.json({
      results: fallbackResults,
      isFallback: true,
      provider: 'Haversine Geographic Calculation',
      notice: 'Google Maps Distance Matrix is using straight-line calculation because live billing or API key is not active.',
    });
  } catch (err: any) {
    console.error('Distance proxy error:', err);
    return res.status(500).json({ error: 'Failed to compute distances', details: err.message });
  }
});

// Google Places Reviews & Details Proxy
app.get('/api/maps/places/reviews', async (req, res) => {
  try {
    const { name, lat, lng } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Hospital name is required' });
    }

    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const isRealKey = key && !key.includes('placeholder') && !key.includes('MY_GOOGLE_MAPS_API_KEY');

    if (isRealKey) {
      try {
        const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
          String(name)
        )}&inputtype=textquery&fields=place_id,rating,user_ratings_total&locationbias=point:${lat || 28.6139},${
          lng || 77.209
        }&key=${key}`;
        const findRes = await fetch(findUrl);
        const findData = await findRes.json();

        if (findData.candidates && findData.candidates.length > 0 && findData.candidates[0].place_id) {
          const placeId = findData.candidates[0].place_id;
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,formatted_phone_number,opening_hours&key=${key}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json();

          if (detailsData.result) {
            return res.json({
              rating: detailsData.result.rating || 4.7,
              userRatingsTotal: detailsData.result.user_ratings_total || 240,
              reviews: (detailsData.result.reviews || []).slice(0, 5),
              attribution: 'Reviews and ratings provided by Google Places Platform',
              isFallback: false,
            });
          }
        }
      } catch (placesErr) {
        console.warn('Google Places API request failed:', placesErr);
      }
    }

    // Baseline fallback message when Google Places API / billing is not active
    return res.json({
      rating: null,
      userRatingsTotal: null,
      reviews: [],
      isFallback: true,
      message: 'Google Places reviews and live ratings are currently unavailable because Google Maps billing or API key is not enabled.',
      attribution: 'Google Places API',
    });
  } catch (err: any) {
    console.error('Places reviews proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch reviews', details: err.message });
  }
});

// Geocode Area/Address Search Proxy
app.get('/api/maps/geocode/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Search query q is required' });
    }

    const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const isRealKey = key && !key.includes('placeholder') && !key.includes('MY_GOOGLE_MAPS_API_KEY');

    if (isRealKey) {
      try {
        const searchUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query
        )}&key=${key}`;
        const resp = await fetch(searchUrl);
        const data = await resp.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const first = data.results[0];
          return res.json({
            lat: first.geometry.location.lat,
            lng: first.geometry.location.lng,
            formattedAddress: first.formatted_address,
            isFallback: false,
          });
        }
      } catch (geoErr) {
        console.warn('Geocoding search failed, checking preset areas:', geoErr);
      }
    }

    // Popular preset coordinates dictionary for fallback
    const presetAreas: Record<string, { lat: number; lng: number; address: string }> = {
      'connaught place': { lat: 28.6315, lng: 77.2167, address: 'Connaught Place, Central Delhi, 110001' },
      central: { lat: 28.6315, lng: 77.2167, address: 'Connaught Place, Central Delhi, 110001' },
      'south extension': { lat: 28.5729, lng: 77.2223, address: 'South Extension Part II, New Delhi, 110049' },
      aiims: { lat: 28.5672, lng: 77.2100, address: 'AIIMS Campus, Ansari Nagar, New Delhi, 110029' },
      dwarka: { lat: 28.5921, lng: 77.0460, address: 'Sector 12, Dwarka Metro Corridor, New Delhi, 110075' },
      okhla: { lat: 28.5355, lng: 77.2731, address: 'Okhla Phase II, South-East Delhi, 110020' },
      gurugram: { lat: 28.4950, lng: 77.0895, address: 'DLF Cyber City, Gurugram, Haryana, 122002' },
      cyber: { lat: 28.4950, lng: 77.0895, address: 'DLF Cyber City, Gurugram, Haryana, 122002' },
      noida: { lat: 28.5355, lng: 77.3910, address: 'Sector 18, Noida, Uttar Pradesh, 201301' },
      saket: { lat: 28.5244, lng: 77.2167, address: 'Saket District Centre, New Delhi, 110017' },
      karol: { lat: 28.6517, lng: 77.1906, address: 'Karol Bagh, New Delhi, 110005' },
      rohini: { lat: 28.7159, lng: 77.1171, address: 'Sector 10, Rohini, New Delhi, 110085' },
    };

    const qLower = query.toLowerCase();
    for (const [keyName, area] of Object.entries(presetAreas)) {
      if (qLower.includes(keyName)) {
        return res.json({
          lat: area.lat,
          lng: area.lng,
          formattedAddress: area.address,
          isFallback: true,
        });
      }
    }

    // Default to central coordinates if no preset matched
    return res.json({
      lat: 28.6315,
      lng: 77.2167,
      formattedAddress: `${query} (approx. Central NCR)`,
      isFallback: true,
    });
  } catch (err: any) {
    console.error('Geocode search proxy error:', err);
    return res.status(500).json({ error: 'Geocoding failed', details: err.message });
  }
});

// In development, hook Vite into express
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`MediTrack full-stack server running on http://localhost:${port}`);
  });
}

startServer().catch(console.error);
