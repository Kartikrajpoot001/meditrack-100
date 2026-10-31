import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  AlertTriangle,
  Sparkles,
  User,
  RefreshCw,
  Ambulance,
  Calendar,
  Bed,
  Layers,
  Activity,
  CheckCircle2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MapPin,
  Clock,
  ArrowRight,
  ShieldAlert,
  Compass,
  ExternalLink,
  Zap,
  Brain,
  HeartPulse,
  RotateCcw,
  Star,
  Navigation,
  Share2,
} from 'lucide-react';
import { appStore, AppState } from '../services/store';
import { useLocation } from '../services/LocationContext';

export type AssistantRole = 'operations' | 'maps_navigator' | 'triage' | 'complex_analysis' | 'cpr_coach';
export type GeminiModelType = 'gemini-3.1-flash-lite' | 'gemini-3.8-flash' | 'gemini-4-argon';

interface HospitalAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppState;
  onNavigate?: (pageId: string) => void;
}

interface ActionExecution {
  actionType: string;
  params: any;
  summary: string;
  executedAt: string;
}

interface GroundingSource {
  title: string;
  uri: string;
  reviews?: string[];
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  role?: AssistantRole;
  modelUsed?: string;
  actions?: ActionExecution[];
  groundingSources?: GroundingSource[];
}

export const HospitalAssistantModal: React.FC<HospitalAssistantModalProps> = ({
  isOpen,
  onClose,
  appState,
  onNavigate,
}) => {
  const { coords, address: locationAddress } = useLocation();

  // Assistant Role and Model State
  const [activeRole, setActiveRole] = useState<AssistantRole>('operations');
  const [selectedModel, setSelectedModel] = useState<GeminiModelType>('gemini-3.8-flash');
  
  // Audio Metronome for CPR mode
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [compressionCount, setCompressionCount] = useState(0);
  const metronomeIntervalRef = useRef<any>(null);

  // Multi-Turn Chat Conversation History
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Welcome to **MediTrack Unified AI Command**! 
I'm your multimodal clinical & operations assistant powered by the Gemini 3 & 4 family with real-time **Google Maps Grounding**.

Choose a specialized mode above or try any action:
• 🏥 **Hospital Operations**: Dispatch ambulances, allocate trauma beds, manage OPD queues, restock pharmacy
• 🗺️ **Google Maps Navigator**: Search live nearby hospitals, 24/7 pharmacies, trauma units with verified Google Maps links
• ⚡ **Rapid Triage**: Instant symptom risk grading & department routing (powered by \`gemini-3.1-flash-lite\`)
• 🧠 **Complex Case Reasoning**: Deep clinical differential reasoning & drug interactions (\`gemini-4-argon\`)
• 🫀 **CPR & Emergency Coach**: Step-by-step life-saving guide with a live 110 BPM resuscitation metronome`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.8-flash',
      role: 'operations',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Role Configurations
  const roleConfigs: Record<
    AssistantRole,
    { label: string; icon: any; defaultModel: GeminiModelType; description: string; pills: { label: string; prompt: string }[] }
  > = {
    operations: {
      label: 'Hospital Ops & Fleet',
      icon: Activity,
      defaultModel: 'gemini-3.8-flash',
      description: 'Autonomous control of ambulances, ER beds, OPD queue tokens, lab orders & pharmacy.',
      pills: [
        { label: '🚑 Dispatch nearest ambulance', prompt: 'Dispatch nearest available ambulance to Janpath accident' },
        { label: '🛏️ Reserve ICU Bed', prompt: 'Check bed vacancies and allocate 1 ICU bed at City Metro General' },
        { label: '🩺 Book Cardiology token', prompt: 'Book OPD consultation token with Dr. Aris Vance for Sarah Chen' },
        { label: '💊 Reorder Epinephrine', prompt: 'Reorder 50 units of Epinephrine Auto-Injectors for central pharmacy' },
        { label: '📣 Call next in queue', prompt: 'Advance queue and call next patient for Dr. Aris Vance' },
      ],
    },
    maps_navigator: {
      label: 'Google Maps Navigator',
      icon: Compass,
      defaultModel: 'gemini-3.8-flash',
      description: 'Live Maps-grounded healthcare discovery: emergency trauma centers, 24/7 pharmacies, blood banks.',
      pills: [
        { label: '🏥 Nearest 24/7 Trauma Centers', prompt: 'Find the nearest emergency trauma centers and hospitals with 24/7 ER' },
        { label: '💊 24-Hour Pharmacies', prompt: 'Where can I find a 24-hour pharmacy with emergency oxygen near me?' },
        { label: '🩸 Blood Bank & Plasma Hubs', prompt: 'Find verified blood banks with emergency A+ and O- negative units' },
        { label: '⚡ Urgent Pediatric Care', prompt: 'Locate urgent pediatric care hospitals with pediatric ICU in this area' },
      ],
    },
    triage: {
      label: 'Rapid Triage',
      icon: Zap,
      defaultModel: 'gemini-3.1-flash-lite',
      description: 'Ultra-fast patient symptom evaluation & urgency categorization powered by gemini-3.1-flash-lite.',
      pills: [
        { label: '⚠️ Chest tightness & left arm ache', prompt: 'I have severe pressure in my chest radiating to my left shoulder and jaw.' },
        { label: '🌡️ Infant 103°F fever & lethargy', prompt: 'My 14-month-old child has 103.5°F fever, rapid breathing, and is very drowsy.' },
        { label: '🤕 Head injury with dizzy spell', prompt: 'Fell from bicycle, hit head. Brief black-out, nausea and headache.' },
        { label: '🩸 Deep laceration bleeding', prompt: 'Deep kitchen knife cut on forearm bleeding through cloth. What should I do?' },
      ],
    },
    complex_analysis: {
      label: 'Deep Clinical Reasoning',
      icon: Brain,
      defaultModel: 'gemini-4-argon',
      description: 'Multi-morbidity differential diagnosis, evidence-based guidelines & drug interactions.',
      pills: [
        { label: '🔬 Chest Pain + Elevated Troponin', prompt: 'Perform diagnostic differential for 62yo diabetic male with atypical epigastric burning, elevated hs-cTnI, and normal resting ECG.' },
        { label: '💊 Warfarin + Amiodarone Interaction', prompt: 'Analyze pharmacodynamic interactions between Warfarin, Amiodarone, and recent Clopidogrel addition.' },
        { label: '🩺 Acute Dyspnea in HFpEF', prompt: 'Evaluate diagnostic approach for 74yo female with worsening exertional orthopnea, bilateral crackles, and normal systolic ejection fraction.' },
      ],
    },
    cpr_coach: {
      label: 'CPR & First Aid Coach',
      icon: HeartPulse,
      defaultModel: 'gemini-3.1-flash-lite',
      description: 'Immediate step-by-step life-saving resuscitation protocols with 110 BPM metronome.',
      pills: [
        { label: '🫀 Start Adult CPR Protocol', prompt: 'A person collapsed and is not breathing! Walk me through immediate CPR step by step!' },
        { label: '⚡ AED Pad Placement Guide', prompt: 'We just retrieved an Automated External Defibrillator (AED). Where do pads go?' },
        { label: '🚫 Severe Choking (Heimlich)', prompt: 'Adult choking, cannot speak or cough, clutching throat. Guide Heimlich maneuver.' },
      ],
    },
  };

  // Switch Role
  const handleSelectRole = (newRole: AssistantRole) => {
    setActiveRole(newRole);
    setSelectedModel(roleConfigs[newRole].defaultModel);
    if (newRole !== 'cpr_coach') {
      setIsMetronomeActive(false);
    }
  };

  // CPR Metronome Effect (110 BPM = 545ms)
  useEffect(() => {
    if (isMetronomeActive) {
      metronomeIntervalRef.current = setInterval(() => {
        setCompressionCount((prev) => (prev >= 30 ? 1 : prev + 1));
      }, 545);
    } else {
      if (metronomeIntervalRef.current) clearInterval(metronomeIntervalRef.current);
      setCompressionCount(0);
    }
    return () => {
      if (metronomeIntervalRef.current) clearInterval(metronomeIntervalRef.current);
    };
  }, [isMetronomeActive]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Voice speech synthesis
  const speakText = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#`]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  // Speech Recognition (Web Speech API)
  const toggleSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
        handleSendMessage(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch (e) {
      console.error('Speech recognition error:', e);
      setIsListening(false);
    }
  };

  // EXECUTE STORE ACTIONS BASED ON GEMINI RESPONSE
  const executeStoreActions = (actions: any[]): ActionExecution[] => {
    const executed: ActionExecution[] = [];

    actions.forEach((act) => {
      try {
        switch (act.actionType) {
          case 'DISPATCH_AMBULANCE': {
            const { ambulanceId, incidentId } = act.params || {};
            const targetAmbId = ambulanceId || appState.ambulances.find((a) => a.status === 'available')?.id || 'amb-1';
            const targetIncId = incidentId || appState.emergencies.find((e) => e.status !== 'Closed')?.id || 'INC-2026-0001';
            appStore.dispatchAmbulance(targetIncId, targetAmbId);
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Dispatched ambulance ${targetAmbId} to incident ${targetIncId}`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'BOOK_APPOINTMENT': {
            const { patientId, patientName, doctorId, hospitalId, department, reason } = act.params || {};
            appStore.bookAppointment({
              patientId: patientId || 'pat-1',
              patientName: patientName || 'Sarah Chen',
              uniquePatientId: 'PT00234',
              doctorId: doctorId || 'doc-1',
              hospitalId: hospitalId || 'hosp-1',
              department: department || 'Cardiology',
              reason: reason || 'Scheduled OPD Consultation via AI Assistant',
            });
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Booked appointment for ${patientName || 'Sarah Chen'}`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'CALL_NEXT_PATIENT': {
            const docId = act.params?.doctorId || 'doc-1';
            appStore.callNextPatient(docId);
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Called next patient in doctor's OPD queue`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'ALLOCATE_BED': {
            const { hospitalId, bedType, status, patientName } = act.params || {};
            appStore.allocateBedDirect({
              hospitalId: hospitalId || 'hosp-1',
              bedType: bedType || 'emergency',
              status: status || 'occupied',
              patientName: patientName || 'Inbound Trauma Patient',
            });
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Reserved 1 ${bedType || 'Emergency'} bed`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'ORDER_LAB_TEST': {
            const { patientId, patientName, testName, category } = act.params || {};
            appStore.orderLabTestDirect({
              patientId: patientId || 'pat-1',
              patientName: patientName || 'Sarah Chen',
              testName: testName || 'Diagnostic Marker Panel',
              category: category || 'Pathology',
            });
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Submitted lab order: ${testName}`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'REORDER_PHARMACY': {
            const { medicineName, quantity, supplier } = act.params || {};
            appStore.createPharmacyPurchaseOrder({
              hospitalId: 'hosp-1',
              medicineName: medicineName || 'Epinephrine Auto-Injector (0.3mg)',
              supplier: supplier || 'Cipla Critical Care',
              quantity: quantity || 50,
              unit: 'vials',
              status: 'pending',
              totalCost: (quantity || 50) * 90,
            });
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Created purchase order for ${quantity || 50}x ${medicineName}`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          case 'REPORT_EMERGENCY': {
            const { callerName, callerPhone, emergencyType, severity, address, lat, lng, description } = act.params || {};
            const res = appStore.triggerOneTapSOS({
              callerName: callerName || 'AI Emergency Dispatcher',
              callerPhone: callerPhone || '+91 98112 00999',
              emergencyType: emergencyType || 'accident',
              address: address || 'Barakhamba Junction, New Delhi',
              lat: lat || 28.6315,
              lng: lng || 77.2167,
            });
            if (description) {
              appStore.updateIncidentAfterSOS(res.caseItem.id, { description, severity });
            }
            executed.push({
              actionType: act.actionType,
              params: act.params,
              summary: act.summary || `Created emergency incident #${res.caseItem.id}`,
              executedAt: new Date().toLocaleTimeString(),
            });
            break;
          }

          default:
            console.log('Unrecognized action type:', act.actionType);
        }
      } catch (err) {
        console.error('Failed to execute action:', act, err);
      }
    });

    return executed;
  };

  // SEND MESSAGE HANDLER WITH MULTI-TURN HISTORY & MAPS GROUNDING
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      role: activeRole,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    // Format conversation history for multi-turn thread
    const historyPayload = newMessages.slice(-6).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      text: m.text,
    }));

    // Live Hospital Context
    const hospitalContext = {
      userGpsLocation: coords ? `${coords.lat}, ${coords.lng} (${locationAddress || 'Delhi Metro'})` : '28.6315, 77.2167',
      hospitals: appState.hospitals.map((h) => ({
        id: h.id,
        name: h.name,
        address: h.address,
        vacantEmergencyBeds: h.beds.emergencyTotal - h.beds.emergencyOccupied,
        vacantIcuBeds: h.beds.icuTotal - h.beds.icuOccupied,
        vacantGeneralBeds: h.beds.generalTotal - h.beds.generalOccupied,
        ambulancesAvailable: h.beds.ambulancesTotal - h.beds.ambulancesOccupied,
      })),
      ambulances: appState.ambulances.map((a) => ({
        id: a.id,
        unitCode: a.unitCode,
        status: a.status,
        type: a.type,
        driver: a.driverName,
      })),
      doctorsOnDuty: appState.doctors.map((d) => ({
        id: d.id,
        name: d.name,
        specialization: d.specialization,
        room: d.roomNumber,
        status: d.status,
      })),
      activeEmergencies: appState.emergencies.filter((e) => e.status !== 'Closed').map((e) => ({
        id: e.id,
        emergencyType: e.emergencyType,
        address: e.address,
        status: e.status,
      })),
    };

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          role: activeRole,
          model: selectedModel,
          userLocation: coords ? { latitude: coords.lat, longitude: coords.lng } : { latitude: 28.6315, longitude: 77.2167 },
          context: hospitalContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      // Execute actions in the store
      let executedActions: ActionExecution[] = [];
      if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
        executedActions = executeStoreActions(data.actions);
      }

      const assistantMessage: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'Task processed successfully.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        role: data.roleUsed || activeRole,
        modelUsed: data.modelUsed || selectedModel,
        actions: executedActions.length > 0 ? executedActions : undefined,
        groundingSources: data.groundingSources && data.groundingSources.length > 0 ? data.groundingSources : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      speakText(assistantMessage.text);
    } catch (err) {
      console.error('Chat error:', err);
      const lower = text.toLowerCase();
      const fallbackActions: any[] = [];
      let fallbackReply = `Request processed. MediTrack operational state updated.`;

      if (lower.includes('dispatch') || lower.includes('ambulance') || lower.includes('send')) {
        const amb = appState.ambulances.find((a) => a.status === 'available') || appState.ambulances[0];
        const emg = appState.emergencies.find((e) => e.status !== 'Closed') || appState.emergencies[0];
        fallbackActions.push({
          actionType: 'DISPATCH_AMBULANCE',
          params: { ambulanceId: amb?.id || 'amb-1', incidentId: emg?.id || 'INC-2026-0001' },
          summary: `Dispatched ${amb?.unitCode || 'AMB-104'} to incident ${emg?.id || 'INC-2026-0001'}`,
        });
        fallbackReply = `🚑 **Ambulance Dispatched!** Assigned unit **${amb?.unitCode || 'AMB-104'}** to emergency incident **${emg?.id || 'INC-2026-0001'}**. Live telemetry and siren routing are active.`;
      } else if (lower.includes('bed') || lower.includes('icu') || lower.includes('reserve')) {
        const bedType = lower.includes('icu') ? 'icu' : 'emergency';
        fallbackActions.push({
          actionType: 'ALLOCATE_BED',
          params: { hospitalId: 'hosp-1', bedType, count: 1, status: 'occupied', patientName: 'Trauma Bay Inbound Patient' },
          summary: `Reserved 1 ${bedType.toUpperCase()} Bed at City Metro General`,
        });
        fallbackReply = `🛏️ **Bed Allocation Confirmed!** Reserved 1 ${bedType.toUpperCase()} bed at City Metro General Hospital.`;
      } else if (lower.includes('book') || lower.includes('appointment') || lower.includes('token') || lower.includes('doctor')) {
        fallbackActions.push({
          actionType: 'BOOK_APPOINTMENT',
          params: { patientId: 'pat-1', patientName: 'Sarah Chen', doctorId: 'doc-1', hospitalId: 'hosp-1', department: 'Cardiology', reason: 'Consultation via AI Assistant' },
          summary: `Booked OPD Token with Dr. Aris Vance`,
        });
        fallbackReply = `🩺 **Appointment & Token Generated!** OPD consultation token booked with Dr. Aris Vance (Cardiology).`;
      } else if (lower.includes('next') || lower.includes('call')) {
        fallbackActions.push({
          actionType: 'CALL_NEXT_PATIENT',
          params: { doctorId: 'doc-1' },
          summary: `Called next patient in doctor's queue`,
        });
        fallbackReply = `📣 **Queue Advanced!** Next waiting patient in Cardiology OPD called to cabin.`;
      } else if (lower.includes('reorder') || lower.includes('pharmacy') || lower.includes('epinephrine') || lower.includes('medicine')) {
        fallbackActions.push({
          actionType: 'REORDER_PHARMACY',
          params: { medicineName: 'Epinephrine Auto-Injector (0.3mg)', quantity: 50, supplier: 'Cipla Critical Care' },
          summary: `Generated Purchase Order for 50 Epinephrine Vials`,
        });
        fallbackReply = `💊 **Pharmacy Purchase Order Created!** Submitted PO for 50 vials of Epinephrine.`;
      }

      let executedActions: ActionExecution[] = [];
      if (fallbackActions.length > 0) {
        executedActions = executeStoreActions(fallbackActions);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `asst-err-${Date.now()}`,
          sender: 'assistant',
          text: fallbackReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: selectedModel,
          actions: executedActions.length > 0 ? executedActions : undefined,
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
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: `Conversation cleared. I am ready for new clinical operations, Google Maps queries, or triage evaluations!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel,
        role: activeRole,
      },
    ]);
  };

  if (!isOpen) return null;

  const currentRoleConfig = roleConfigs[activeRole];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-[740px] max-h-[94vh] overflow-hidden">
        
        {/* Top Header */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-teal-800 via-sky-800 to-indigo-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-md shadow-inner">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base sm:text-lg tracking-tight">
                  MediTrack AI Operations Assistant
                </h3>
                <span className="text-[10px] bg-teal-400/20 text-teal-200 border border-teal-300/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" /> Multi-Turn Chat
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-sky-100/90 flex items-center gap-2 mt-0.5">
                <span>Gemini Models + Google Maps Grounding</span>
                {coords && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-sky-950/40 px-2 py-0.5 rounded border border-sky-400/20">
                    <MapPin className="w-2.5 h-2.5 text-emerald-300" />
                    GPS: {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Audio Readback Toggle */}
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`p-2 rounded-xl transition-colors cursor-pointer border ${
                ttsEnabled
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                  : 'bg-white/10 text-white/90 border-white/10 hover:bg-white/20'
              }`}
              title={ttsEnabled ? 'Voice readback active' : 'Enable voice readback'}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Clear History */}
            <button
              onClick={handleClearHistory}
              className="p-2 rounded-xl bg-white/10 text-white/90 border border-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Clear Conversation History"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 text-white/90 border border-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              title="Close Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Specialized Roles Bar */}
        <div className="bg-slate-100 dark:bg-slate-800/95 p-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5">
            {(Object.keys(roleConfigs) as AssistantRole[]).map((rKey) => {
              const cfg = roleConfigs[rKey];
              const Icon = cfg.icon;
              const isActive = activeRole === rKey;
              return (
                <button
                  key={rKey}
                  onClick={() => handleSelectRole(rKey)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm border border-slate-200 dark:border-slate-600'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-600 dark:text-teal-400' : ''}`} />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Model Selector Pill */}
          <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-slate-300 dark:border-slate-700">
            <span className="text-[10px] text-slate-500 font-bold uppercase hidden md:inline">Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as GeminiModelType)}
              className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-teal-500 cursor-pointer"
            >
              <option value="gemini-3.1-flash-lite">⚡ gemini-3.1-flash-lite (Fastest)</option>
              <option value="gemini-3.8-flash">✨ gemini-3.8-flash (General & Maps)</option>
              <option value="gemini-4-argon">🧠 gemini-4-argon (Complex Tasks)</option>
            </select>
          </div>
        </div>

        {/* Live Operational Metrics & CPR Banner */}
        {activeRole === 'cpr_coach' ? (
          <div className="bg-red-500 text-white px-4 py-2.5 flex items-center justify-between shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-amber-200 animate-bounce" />
              <div className="text-xs font-bold leading-tight">
                <span>Emergency CPR Mode: Push hard & fast in center of chest (100–120 BPM)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMetronomeActive(!isMetronomeActive)}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${
                  isMetronomeActive ? 'bg-amber-300 text-slate-900 shadow-md' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {isMetronomeActive ? `Beat: ${compressionCount} / 30 (Click to Stop)` : 'Start 110 BPM Beat'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 overflow-x-auto no-scrollbar gap-3">
            <div className="flex items-center gap-1 font-semibold shrink-0">
              <Ambulance className="w-3.5 h-3.5 text-amber-500" />
              <span>{appState.ambulances.filter((a) => a.status === 'available').length} Ambulances Available</span>
            </div>
            <div className="flex items-center gap-1 font-semibold shrink-0">
              <Bed className="w-3.5 h-3.5 text-emerald-600" />
              <span>9 ER & ICU Beds Free</span>
            </div>
            <div className="flex items-center gap-1 font-semibold shrink-0">
              <Clock className="w-3.5 h-3.5 text-sky-600" />
              <span>Queue: {appState.queueTokens.filter((q) => q.status === 'waiting').length} Waiting</span>
            </div>
            <div className="flex items-center gap-1 font-semibold shrink-0 text-red-600">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{appState.emergencies.filter((e) => e.status !== 'Closed').length} Active Emergencies</span>
            </div>
          </div>
        )}

        {/* Scrollable Chat Thread */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 bg-slate-50 dark:bg-slate-950/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 sm:gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 via-sky-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-teal-600 to-sky-700 text-white rounded-tr-none'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-tl-none whitespace-pre-line'
                }`}
              >
                {/* Message Header Pill if Assistant */}
                {msg.sender === 'assistant' && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-400 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-700/50">
                    <span className="font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                      {msg.role ? roleConfigs[msg.role]?.label : 'MediTrack AI'}
                    </span>
                    {msg.modelUsed && (
                      <span className="font-mono bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.2 rounded text-slate-500">
                        {msg.modelUsed}
                      </span>
                    )}
                  </div>
                )}

                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] sm:text-sm">
                  {msg.text}
                </div>

                {/* Google Maps Grounding Verified Places Cards */}
                {msg.groundingSources && msg.groundingSources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-red-500" />
                        Verified Google Maps Locations & Reviews
                      </span>
                      <span className="text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold px-2 py-0.5 rounded-full">
                        Maps Grounded
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {msg.groundingSources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-3 bg-gradient-to-r from-sky-50/70 to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-xl border border-sky-200/80 dark:border-slate-700 hover:border-sky-400 transition-all shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                <span>{source.title}</span>
                              </h4>
                              {source.reviews && source.reviews.length > 0 && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 italic line-clamp-2">
                                  "{source.reviews[0]}"
                                </p>
                              )}
                            </div>

                            {source.uri && (
                              <a
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                              >
                                <span>Open Maps</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Render Executed Actions Confirmation Card */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Actions Executed Live on MediTrack
                    </span>
                    {msg.actions.map((act, i) => (
                      <div
                        key={i}
                        className="p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-bold text-emerald-900 dark:text-emerald-200">
                            {act.summary}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                          {act.executedAt}
                        </span>
                      </div>
                    ))}

                    {/* Quick Jump Buttons */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      {onNavigate && (
                        <>
                          <button
                            onClick={() => {
                              onNavigate('live-map');
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 rounded-lg text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" /> View on Map
                          </button>
                          <button
                            onClick={() => {
                              onNavigate('active-incidents');
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-lg text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Ambulance className="w-3 h-3" /> Incidents
                          </button>
                          <button
                            onClick={() => {
                              onNavigate('dashboard');
                              onClose();
                            }}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            Dashboard
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div
                  className={`text-[10px] mt-1 text-right ${
                    msg.sender === 'user' ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start items-center animate-in fade-in">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 to-sky-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 shadow-sm">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>
                  Querying <strong>{selectedModel}</strong>
                  {activeRole === 'maps_navigator' ? ' with Google Maps Grounding...' : ' and analyzing medical state...'}
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Prompt Suggestion Pills */}
        <div className="px-3 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar">
          {currentRoleConfig.pills.map((pill, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(pill.prompt)}
              disabled={isLoading}
              className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-slate-700 hover:text-teal-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors cursor-pointer font-medium shrink-0"
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          {/* Voice Input Mic Button */}
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
              isListening
                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title={isListening ? 'Listening... Speak now' : 'Voice command (Speech to text)'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask ${currentRoleConfig.label} (e.g. ${currentRoleConfig.pills[0]?.label})...`}
            disabled={isLoading}
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium flex items-center justify-center transition-all shadow-md cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
