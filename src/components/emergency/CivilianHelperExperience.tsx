import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  MapPin,
  Footprints,
  Car,
  Compass,
  CheckCircle2,
  Phone,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Info,
  X,
  Clock,
  Navigation,
  Check,
  ChevronDown,
  ChevronUp,
  Radio,
  Sparkles,
  Send,
  Zap,
  Heart,
  Volume2,
  VolumeX,
  Hospital,
  Activity,
  CheckSquare,
  Square,
} from 'lucide-react';
import { AppState, appStore, getDistanceInMeters } from '../../services/store';
import { AuthUser } from '../../services/auth';
import {
  EmergencyCase,
  HelperRoleOption,
  IncidentHelper,
} from '../../types';
import { GoogleMapsView, MarkerItem } from '../GoogleMapsView';

interface CivilianHelperExperienceProps {
  appState: AppState;
  currentUser: AuthUser | null;
  onOpenOneTapSOS?: () => void;
}

export const CivilianHelperExperience: React.FC<CivilianHelperExperienceProps> = ({
  appState,
  currentUser,
}) => {
  // Ignored incidents (by ID) so the notification card is dismissed for this session
  const [ignoredIds, setIgnoredIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('meditrack_ignored_helpers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Flow State: 'notification' | 'choose_role' | 'mission'
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(() => {
    return sessionStorage.getItem('meditrack_active_helper_incident') || null;
  });

  const [activeRole, setActiveRole] = useState<HelperRoleOption | null>(() => {
    return (sessionStorage.getItem('meditrack_active_helper_role') as HelperRoleOption) || null;
  });

  const [isFullScreenChooseRole, setIsFullScreenChooseRole] = useState<boolean>(false);
  const [selectedIncidentForRoleChoice, setSelectedIncidentForRoleChoice] = useState<EmergencyCase | null>(null);
  const [slotClaimError, setSlotClaimError] = useState<string | null>(null);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState<boolean>(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState<boolean>(false);
  const [missionMinimized, setMissionMinimized] = useState<boolean>(false);

  // Guide Ambulance custom input states
  const [guideSpotInput, setGuideSpotInput] = useState<string>('');
  const [guideLandmarksInput, setGuideLandmarksInput] = useState<string>('');
  const [guideRoadBlocksInput, setGuideRoadBlocksInput] = useState<string>('');
  const [guideSentNotice, setGuideSentNotice] = useState<boolean>(false);
  const [isScreenStrobeActive, setIsScreenStrobeActive] = useState<boolean>(false);

  // First Aid / CPR Coach interactive state
  const [isCprMetronomeActive, setIsCprMetronomeActive] = useState<boolean>(false);
  const [cprBeatPulse, setCprBeatPulse] = useState<boolean>(false);
  const [cprSoundEnabled, setCprSoundEnabled] = useState<boolean>(true);
  const [safetyChecklist, setSafetyChecklist] = useState({
    trafficSafe: false,
    airwayClear: false,
    bleedingControlled: false,
  });

  // Transport Victim specific stage ('to_scene' | 'in_transit' | 'at_hospital')
  const [transportStage, setTransportStage] = useState<'to_scene' | 'in_transit' | 'at_hospital'>('to_scene');
  const [transportHospital, setTransportHospital] = useState<{ id: string; name: string; lat: number; lng: number }>({
    id: 'hosp-1',
    name: 'City Metro General Hospital (Emergency Trauma Bay)',
    lat: 12.9716,
    lng: 77.5946,
  });

  // Throttle ref for GPS position updates (every 3.5 seconds)
  const lastLocationBroadcastRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Helper ID persistent across tabs/refreshes
  const helperIdRef = useRef<string>('');
  if (!helperIdRef.current) {
    let existing: string | null = null;
    try {
      existing = typeof window !== 'undefined' ? sessionStorage.getItem('meditrack_helper_id') : null;
      if (!existing) {
        existing = `hlp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        sessionStorage.setItem('meditrack_helper_id', existing);
      }
    } catch {
      existing = `hlp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    helperIdRef.current = existing;
  }
  const helperId = helperIdRef.current;
  const helperName = currentUser?.name || 'Civilian Responder (You)';

  // Find candidate incident nearby that needs helpers and isn't closed or ignored
  const activeEmergencies = appState.emergencies.filter((e) => e.status !== 'Closed');

  // Currently active mission incident
  const currentMissionIncident = activeIncidentId
    ? appState.emergencies.find((e) => e.id === activeIncidentId)
    : null;

  // The helper record on that incident
  const currentHelperRecord = currentMissionIncident?.helpers?.find(
    (h) => h.id === helperId || h.name === helperName || (h.id && helperId && h.id.includes(helperId))
  );

  // Compute a default realistic location ~320m southwest of incident if GPS is null/denied
  const getInitialFallbackCoords = (incident?: EmergencyCase | null) => {
    if (incident) {
      return {
        lat: Number((incident.lat - 0.0025).toFixed(6)),
        lng: Number((incident.lng - 0.0022).toFixed(6)),
      };
    }
    return { lat: 12.9680, lng: 77.5920 };
  };

  // Live GPS tracking state with resilient default
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number }>(() => {
    return getInitialFallbackCoords(currentMissionIncident);
  });
  const [myAccuracy, setMyAccuracy] = useState<number | null>(12);
  const [gpsStatus, setGpsStatus] = useState<'acquiring' | 'ready' | 'denied' | 'error'>('ready');

  // Sync coords with mission if initial was generic
  useEffect(() => {
    if (currentMissionIncident && (!myCoords || (myCoords.lat === 12.9680 && myCoords.lng === 77.5920))) {
      setMyCoords(getInitialFallbackCoords(currentMissionIncident));
    }
  }, [currentMissionIncident]);

  // Sync transport stage from helper record
  useEffect(() => {
    if (currentHelperRecord) {
      if (currentHelperRecord.status === 'assistance_given') {
        setTransportStage('in_transit');
      } else if (currentHelperRecord.status === 'arrived') {
        if (transportStage === 'to_scene') setTransportStage('to_scene');
      }
    }
  }, [currentHelperRecord]);

  // 1. LIVE GPS WATCHER (navigator.geolocation.watchPosition)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('denied');
      return;
    }

    let isSubscribed = true;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isSubscribed) return;
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);

        setMyCoords({ lat, lng });
        setMyAccuracy(acc);
        setGpsStatus('ready');

        // Throttle updates to incident responder record in store.ts (every 3 seconds)
        const now = Date.now();
        if (activeIncidentId && now - lastLocationBroadcastRef.current >= 3000) {
          lastLocationBroadcastRef.current = now;
          appStore.updateResponderLocation(activeIncidentId, helperId, { lat, lng }, acc);
        }
      },
      (err) => {
        if (!isSubscribed) return;
        console.warn('Geolocation warning (using resilient simulation coords):', err.message);
        if (err.code === 1) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('error');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
    );

    return () => {
      isSubscribed = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeIncidentId, helperId]);

  // CPR Metronome Sound generator (110 BPM = ~545ms interval)
  const playCprBeep = () => {
    if (!cprSoundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High crisp click
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  // Metronome Timer
  useEffect(() => {
    if (!isCprMetronomeActive) return;
    const interval = setInterval(() => {
      setCprBeatPulse((prev) => !prev);
      playCprBeep();
    }, 545); // 110 BPM
    return () => clearInterval(interval);
  }, [isCprMetronomeActive, cprSoundEnabled]);

  // If incident was closed, finish mission
  useEffect(() => {
    if (activeIncidentId && (!currentMissionIncident || currentMissionIncident.status === 'Closed')) {
      setActiveIncidentId(null);
      setActiveRole(null);
      sessionStorage.removeItem('meditrack_active_helper_incident');
      sessionStorage.removeItem('meditrack_active_helper_role');
    }
  }, [activeIncidentId, currentMissionIncident]);

  // Find the first unaccepted nearby emergency to alert on (excluding ignored ones)
  const nearbyAlertIncident = activeEmergencies.find((emg) => {
    if (activeIncidentId) return false;
    if (ignoredIds.includes(emg.id)) return false;
    const alreadyHelper = emg.helpers?.some((h) => h.id === helperId || h.name === helperName);
    return !alreadyHelper;
  });

  // Calculate distance
  const getDistanceText = (emg: EmergencyCase) => {
    const coords = myCoords || getInitialFallbackCoords(emg);
    const meters = getDistanceInMeters(coords.lat, coords.lng, emg.lat, emg.lng);
    if (meters < 40) return 'At Scene (0m)';
    if (meters < 1000) return `${Math.round(meters)}m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  };

  const getDistanceNum = (emg: EmergencyCase) => {
    const coords = myCoords || getInitialFallbackCoords(emg);
    return Number((getDistanceInMeters(coords.lat, coords.lng, emg.lat, emg.lng) / 1000).toFixed(2));
  };

  // Handlers
  const handleIgnore = (incidentId: string) => {
    const updated = [...ignoredIds, incidentId];
    setIgnoredIds(updated);
    try {
      sessionStorage.setItem('meditrack_ignored_helpers', JSON.stringify(updated));
    } catch {}
  };

  const handleOpenChooseRole = (incident: EmergencyCase) => {
    setSelectedIncidentForRoleChoice(incident);
    setIsFullScreenChooseRole(true);
  };

  const handleSelectRole = (role: HelperRoleOption) => {
    const incident = selectedIncidentForRoleChoice || nearbyAlertIncident;
    if (!incident) return;

    setSlotClaimError(null);
    if (role === 'transport_victim' && incident.claimedSlots?.transport) {
      setSlotClaimError('This slot was just claimed by another helper.');
      return;
    }
    if (role === 'guide_ambulance' && incident.claimedSlots?.guide) {
      setSlotClaimError('This slot was just claimed by another helper.');
      return;
    }
    if (role === 'help_scene' && (incident.claimedSlots?.scene?.length || 0) >= 2) {
      setSlotClaimError('Help at scene is already at maximum capacity (2 helpers).');
      return;
    }

    const startCoords = myCoords || getInitialFallbackCoords(incident);
    setMyCoords(startCoords);
    const dist = getDistanceNum(incident);
    const eta = Math.max(1, Math.round(dist * 3));

    appStore.claimAssistanceSlot(
      incident.id,
      role === 'help_scene' ? 'help_scene' : role === 'transport_victim' ? 'transport' : 'guide_ambulance',
      {
        id: helperId,
        name: helperName,
        role: 'civilian_helper',
        location: startCoords,
        accuracy: myAccuracy || 10,
        distanceKm: dist,
        etaMinutes: eta,
      }
    );

    setActiveIncidentId(incident.id);
    setActiveRole(role);
    setIsFullScreenChooseRole(false);

    try {
      sessionStorage.setItem('meditrack_active_helper_incident', incident.id);
      sessionStorage.setItem('meditrack_active_helper_role', role);
    } catch {}
  };

  const handleMarkArrived = () => {
    if (!currentMissionIncident) return;
    const targetHelperId = currentHelperRecord?.id || helperId;
    appStore.helperMarkArrived(currentMissionIncident.id, targetHelperId, 'Civilian helper arrived on scene.');

    // Snap my position onto incident location
    const sceneCoords = { lat: currentMissionIncident.lat, lng: currentMissionIncident.lng };
    setMyCoords(sceneCoords);
    appStore.updateResponderLocation(currentMissionIncident.id, targetHelperId, sceneCoords, 3);
  };

  const handleMarkAssistanceGiven = () => {
    if (!currentMissionIncident) return;
    const targetHelperId = currentHelperRecord?.id || helperId;
    appStore.helperMarkAssistanceGiven(currentMissionIncident.id, targetHelperId);
    if (activeRole === 'transport_victim') {
      setTransportStage('in_transit');
    }
  };

  const handleFinishTransportHospital = () => {
    if (!currentMissionIncident) return;
    const targetHelperId = currentHelperRecord?.id || helperId;
    setTransportStage('at_hospital');
    setMyCoords({ lat: transportHospital.lat, lng: transportHospital.lng });
    appStore.updateResponderLocation(currentMissionIncident.id, targetHelperId, { lat: transportHospital.lat, lng: transportHospital.lng }, 5);
    appStore.addNotification({
      recipientRole: 'all',
      title: '🏥 Casualty Arrived at Trauma Bay',
      message: `${helperName} successfully transported the casualty to ${transportHospital.name}. Medical team receiving patient.`,
      type: 'emergency',
    });
  };

  const handleSendGuideUpdate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentMissionIncident) return;

    const targetHelperId = currentHelperRecord?.id || helperId;
    appStore.guideAmbulanceUpdate(currentMissionIncident.id, targetHelperId, {
      landmarks: guideLandmarksInput.trim() || undefined,
      roadBlocks: guideRoadBlocksInput.trim() || undefined,
      notes: guideSpotInput.trim() || undefined,
    });

    setGuideSentNotice(true);
    setTimeout(() => setGuideSentNotice(false), 4000);
    setGuideSpotInput('');
    setGuideLandmarksInput('');
    setGuideRoadBlocksInput('');
  };

  const handleQuickAddGuidePill = (text: string) => {
    setGuideRoadBlocksInput((prev) => (prev ? `${prev}, ${text}` : text));
  };

  const handleEndMission = () => {
    // Open in-UI confirmation modal (avoids window.confirm which is blocked in sandboxed iframes)
    setShowEndConfirmModal(true);
  };

  const executeConfirmEndMission = () => {
    if (currentMissionIncident) {
      const targetHelperId = currentHelperRecord?.id || helperId;
      const slot =
        activeRole === 'help_scene' ? 'help_scene' : activeRole === 'transport_victim' ? 'transport' : 'guide_ambulance';
      appStore.cancelAssistanceSlot(
        currentMissionIncident.id,
        slot,
        targetHelperId,
        'Helper finished or stepped down'
      );
    }
    setIsCprMetronomeActive(false);
    setIsScreenStrobeActive(false);
    setActiveIncidentId(null);
    setActiveRole(null);
    setShowEndConfirmModal(false);
    setTransportStage('to_scene');
    try {
      sessionStorage.removeItem('meditrack_active_helper_incident');
      sessionStorage.removeItem('meditrack_active_helper_role');
    } catch {}
    appStore.addNotification({
      recipientRole: 'all',
      title: '🏁 Mission Concluded',
      message: `Assistance mission ended for #${currentMissionIncident?.id || 'emergency'}. Thank you for your service!`,
      type: 'emergency',
    });
  };

  // Realistic Simulation: Step closer towards destination for seamless testing without walking outside
  const handleSimulateStepForward = () => {
    if (!currentMissionIncident) return;
    const current = myCoords || getInitialFallbackCoords(currentMissionIncident);
    
    // If transport is actively in transit towards hospital, step towards hospital!
    const isEnRouteToHospital = activeRole === 'transport_victim' && transportStage === 'in_transit';
    const target = isEnRouteToHospital
      ? { lat: transportHospital.lat, lng: transportHospital.lng }
      : { lat: currentMissionIncident.lat, lng: currentMissionIncident.lng };

    const remainingMeters = getDistanceInMeters(current.lat, current.lng, target.lat, target.lng);
    
    let newLoc: { lat: number; lng: number };
    if (remainingMeters <= 50) {
      newLoc = { lat: target.lat, lng: target.lng };
      if (!isEnRouteToHospital && currentHelperRecord?.status !== 'arrived' && currentHelperRecord?.status !== 'assistance_given') {
        handleMarkArrived();
      }
    } else {
      const stepLat = current.lat + (target.lat - current.lat) * 0.40;
      const stepLng = current.lng + (target.lng - current.lng) * 0.40;
      newLoc = { lat: Number(stepLat.toFixed(6)), lng: Number(stepLng.toFixed(6)) };
    }

    setMyCoords(newLoc);
    const targetHelperId = currentHelperRecord?.id || helperId;
    appStore.updateResponderLocation(currentMissionIncident.id, targetHelperId, newLoc, 5);
  };

  const checkSlotStatus = (emg: EmergencyCase, role: HelperRoleOption) => {
    if (role === 'help_scene') {
      const count = emg.helpers?.filter((h) => h.roleOption === 'help_scene').length || 0;
      const isTaken = count >= 2;
      return {
        isTaken,
        label: isTaken ? 'Taken by another helper' : `${2 - count} slot(s) open`,
      };
    }
    if (role === 'transport_victim') {
      const isTaken =
        !!emg.claimedSlots?.transport ||
        (emg.helpers?.some((h) => h.roleOption === 'transport_victim') ?? false);
      return {
        isTaken,
        label: isTaken ? 'Taken by another helper' : '1 slot open',
      };
    }
    if (role === 'guide_ambulance') {
      const isTaken =
        !!emg.claimedSlots?.guide ||
        (emg.helpers?.some((h) => h.roleOption === 'guide_ambulance') ?? false);
      return {
        isTaken,
        label: isTaken ? 'Taken by another helper' : '1 slot open',
      };
    }
    return { isTaken: false, label: 'Available' };
  };

  // Google Maps Walking Navigation link
  const getGoogleMapsDirUrl = (destLat: number, destLng: number) => {
    const coords = myCoords || (currentMissionIncident ? getInitialFallbackCoords(currentMissionIncident) : null);
    if (!coords) {
      return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=walking`;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lng}&destination=${destLat},${destLng}&travelmode=walking`;
  };

  return (
    <>
      {/* ========================================================
          FULLSCREEN STROBE FLASHER FOR "GUIDE AMBULANCE" ROLE
          ======================================================== */}
      {isScreenStrobeActive && (
        <div
          role="dialog"
          aria-label="High visibility ambulance strobe signal"
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 animate-pulse select-none bg-amber-400 text-slate-950"
        >
          <div className="w-full flex justify-between items-center">
            <span className="text-sm font-black uppercase tracking-widest bg-black text-amber-300 px-3 py-1 rounded-full">
              Ambulance Signal Beacon Active
            </span>
            <button
              type="button"
              onClick={() => setIsScreenStrobeActive(false)}
              className="p-2 bg-black text-white rounded-full font-black text-xs hover:scale-105 transition-transform"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="text-center space-y-4 max-w-sm">
            <Radio className="w-20 h-20 mx-auto animate-ping" />
            <h2 className="text-3xl font-black uppercase tracking-tight">Wave Screen Towards Approaching Ambulance</h2>
            <p className="text-sm font-bold opacity-90">
              Hold phone high overhead so the ambulance driver spots your position at the intersection.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsScreenStrobeActive(false)}
            className="w-full py-4 bg-black text-white font-black text-sm rounded-2xl shadow-xl cursor-pointer"
          >
            Close Signal Screen
          </button>
        </div>
      )}

      {/* ========================================================
          1. NOTIFICATION CARD: Emergency nearby
          ======================================================== */}
      {nearbyAlertIncident && !isFullScreenChooseRole && !activeIncidentId && (
        <aside
          role="region"
          aria-label="Nearby emergency notification"
          className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
        >
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-500 p-5 space-y-3.5 ring-4 ring-red-500/10">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <span className="text-xs font-black tracking-wider uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  Emergency nearby
                </span>
              </div>
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1 font-mono">
                <MapPin className="w-3.5 h-3.5 text-red-600" />
                <span>{getDistanceText(nearbyAlertIncident)}</span>
              </span>
            </div>

            {/* Incident Type & Location */}
            <div>
              <div className="text-base font-black text-slate-900 tracking-tight flex items-center justify-between">
                <span>{nearbyAlertIncident.emergencyType.toUpperCase()}</span>
                <span className="text-[11px] font-mono font-bold text-slate-500">
                  #{nearbyAlertIncident.id}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                {nearbyAlertIncident.address}
              </p>
            </div>

            <p className="text-xs text-slate-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80 font-medium leading-relaxed">
              Someone needs help. You can safely assist with live navigation and step-by-step guidance.
            </p>

            {/* Accept / Ignore Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleIgnore(nearbyAlertIncident.id)}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors text-center"
              >
                Ignore
              </button>
              <button
                type="button"
                onClick={() => handleOpenChooseRole(nearbyAlertIncident)}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
              >
                <span>Accept</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ========================================================
          2. FULL-SCREEN "CHOOSE HOW YOU CAN HELP" PAGE
          ======================================================== */}
      {isFullScreenChooseRole && selectedIncidentForRoleChoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-role-title"
          className="fixed inset-0 z-50 bg-[#F4F7F8] overflow-y-auto animate-in fade-in duration-200 flex flex-col"
        >
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-8 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-500">
                    {selectedIncidentForRoleChoice.id}
                  </span>
                  <span className="text-[11px] font-bold uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded">
                    {selectedIncidentForRoleChoice.emergencyType}
                  </span>
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    • {getDistanceText(selectedIncidentForRoleChoice)}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-700 truncate max-w-md">
                  {selectedIncidentForRoleChoice.address}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHowItWorksOpen(true)}
                className="text-xs font-bold text-teal-700 hover:text-teal-800 underline flex items-center gap-1 cursor-pointer"
              >
                <Info className="w-4 h-4" />
                <span>How does this work?</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFullScreenChooseRole(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Cancel"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </header>

          {/* Main Container */}
          <main className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-8 space-y-6 flex flex-col justify-center">
            <div className="text-center space-y-1">
              <h1 id="choose-role-title" className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Choose how you can help
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
                Pick the role that fits what you can do safely right now. Live GPS navigation will guide you step-by-step.
              </p>
            </div>

            {slotClaimError && (
              <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{slotClaimError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSlotClaimError(null)}
                  className="p-1 text-rose-600 hover:text-rose-900 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* THREE LARGE CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Help at Scene */}
              {(() => {
                const status = checkSlotStatus(selectedIncidentForRoleChoice, 'help_scene');
                return (
                  <div
                    className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all ${
                      status.isTaken
                        ? 'bg-slate-100 border-slate-300 opacity-60 cursor-not-allowed'
                        : 'bg-white border-blue-400 hover:border-blue-600 shadow-md hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <Footprints className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900">Help at Scene</h3>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Walk to scene with live turn-by-turn route, 110 BPM CPR coach, and first aid checklist.
                      </p>
                      <div className="pt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>Estimated effort: ~15 mins • Walking route</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100">
                      {status.isTaken ? (
                        <div className="text-center text-xs font-bold text-slate-500 py-2.5 bg-slate-200/80 rounded-xl">
                          Taken by another helper
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectRole('help_scene')}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>I Will Help at Scene</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Card 2: Transport Victim */}
              {(() => {
                const status = checkSlotStatus(selectedIncidentForRoleChoice, 'transport_victim');
                return (
                  <div
                    className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all ${
                      status.isTaken
                        ? 'bg-slate-100 border-slate-300 opacity-60 cursor-not-allowed'
                        : 'bg-white border-emerald-400 hover:border-emerald-600 shadow-md hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        <Car className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900">Transport Victim</h3>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Navigate to casualty, stage vehicle, and drive along live hospital ER route to trauma center.
                      </p>
                      <div className="pt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Estimated effort: ~20 mins • Requires vehicle</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100">
                      {status.isTaken ? (
                        <div className="text-center text-xs font-bold text-slate-500 py-2.5 bg-slate-200/80 rounded-xl">
                          Taken by another helper
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectRole('transport_victim')}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>I Will Transport Victim</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Card 3: Guide Ambulance */}
              {(() => {
                const status = checkSlotStatus(selectedIncidentForRoleChoice, 'guide_ambulance');
                return (
                  <div
                    className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all ${
                      status.isTaken
                        ? 'bg-slate-100 border-slate-300 opacity-60 cursor-not-allowed'
                        : 'bg-white border-purple-400 hover:border-purple-600 shadow-md hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                        <Compass className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900">Guide Ambulance</h3>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Reach nearest intersection, flash screen strobe, and relay clear alley routes directly to paramedics.
                      </p>
                      <div className="pt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>Estimated effort: ~5-10 mins • Street signaling</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100">
                      {status.isTaken ? (
                        <div className="text-center text-xs font-bold text-slate-500 py-2.5 bg-slate-200/80 rounded-xl">
                          Taken by another helper
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectRole('guide_ambulance')}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>I Will Guide Ambulance</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </main>
        </div>
      )}

      {/* ========================================================
          3. ACTIVE HELPER MISSION DASHBOARD
          ======================================================== */}
      {currentMissionIncident && activeRole && (
        <aside
          role="region"
          aria-label="Active emergency assistance mission"
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-slate-300 shadow-2xl transition-all pointer-events-auto"
        >
          {/* Status banner */}
          <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <div className="text-xs font-black tracking-wide flex items-center gap-2">
                <span>Active Mission: #{currentMissionIncident.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-teal-800/80 text-teal-200 border border-teal-600">
                  {activeRole.replace('_', ' ')}
                </span>
                {currentHelperRecord?.status && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-600">
                    Status: {currentHelperRecord.status.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMissionMinimized(!missionMinimized)}
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer text-xs font-semibold flex items-center gap-1"
              >
                <span>{missionMinimized ? 'Expand Navigation' : 'Minimize'}</span>
                {missionMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleEndMission}
                className="text-[11px] font-semibold text-rose-300 hover:text-rose-100 hover:underline px-2 py-0.5 cursor-pointer"
              >
                End Mission
              </button>
            </div>
          </div>

          {/* Expanded Mission Panel */}
          {!missionMinimized && (
            <div className="max-h-[82vh] overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F8FAFC]">
              {/* SECTION A: GOOGLE MAP WITH ROUTE, LIVE POSITION, DISTANCE & ETA */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span className="font-black text-slate-900 text-xs sm:text-sm">
                      Live Route & Navigation to Incident
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      GPS Live (Accuracy: ±{myAccuracy || 8}m)
                    </span>
                  </div>

                  {/* Open in Google Maps Walking/Driving Navigation button */}
                  <div className="flex items-center gap-2">
                    <a
                      href={getGoogleMapsDirUrl(
                        activeRole === 'transport_victim' && transportStage === 'in_transit'
                          ? transportHospital.lat
                          : currentMissionIncident.lat,
                        activeRole === 'transport_victim' && transportStage === 'in_transit'
                          ? transportHospital.lng
                          : currentMissionIncident.lng
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-xs cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Google Maps App</span>
                    </a>
                  </div>
                </div>

                {/* The Live Google Map */}
                {(() => {
                  const effectiveCoords = myCoords || getInitialFallbackCoords(currentMissionIncident);
                  const isEnRouteToHospital = activeRole === 'transport_victim' && transportStage === 'in_transit';

                  const mapCenter = effectiveCoords;
                  
                  // Route points: If in transit to hospital, show route to hospital. Otherwise route to incident!
                  const routePts = isEnRouteToHospital
                    ? [
                        effectiveCoords,
                        { lat: (effectiveCoords.lat + transportHospital.lat) / 2, lng: (effectiveCoords.lng + transportHospital.lng) / 2 },
                        { lat: transportHospital.lat, lng: transportHospital.lng },
                      ]
                    : [
                        effectiveCoords,
                        {
                          lat: (effectiveCoords.lat + currentMissionIncident.lat) / 2,
                          lng: (effectiveCoords.lng + currentMissionIncident.lng) / 2,
                        },
                        { lat: currentMissionIncident.lat, lng: currentMissionIncident.lng },
                      ];

                  const markers: MarkerItem[] = [
                    {
                      id: 'incident-target',
                      lat: currentMissionIncident.lat,
                      lng: currentMissionIncident.lng,
                      title: `${currentMissionIncident.emergencyType.toUpperCase()} (${currentMissionIncident.id})`,
                      type: 'emergency',
                      subtitle: currentMissionIncident.address,
                    },
                    {
                      id: helperId,
                      lat: effectiveCoords.lat,
                      lng: effectiveCoords.lng,
                      title: 'Your Live Position',
                      type: 'responder',
                      subtitle: `Civilian Helper (${activeRole.replace('_', ' ')})`,
                      isHelper: true,
                    },
                  ];

                  // If in transport, also show hospital destination marker!
                  if (activeRole === 'transport_victim') {
                    markers.push({
                      id: transportHospital.id,
                      lat: transportHospital.lat,
                      lng: transportHospital.lng,
                      title: transportHospital.name,
                      type: 'hospital',
                      subtitle: 'Target Emergency Trauma Bay',
                    });
                  }

                  // Also show official ambulance if dispatched
                  if (currentMissionIncident.assignedAmbulance) {
                    markers.push({
                      id: currentMissionIncident.assignedAmbulance.id,
                      lat: currentMissionIncident.assignedAmbulance.lat,
                      lng: currentMissionIncident.assignedAmbulance.lng,
                      title: currentMissionIncident.assignedAmbulance.unitCode,
                      type: 'responder',
                      subtitle: `Official Ambulance • ETA: ${currentMissionIncident.assignedAmbulance.etaMinutes}m`,
                    });
                  }

                  const distNum = getDistanceNum(currentMissionIncident);
                  const walkingMins = Math.max(1, Math.round(distNum * 12));

                  return (
                    <div className="space-y-2">
                      <GoogleMapsView
                        center={mapCenter}
                        zoom={15}
                        markers={markers}
                        routePoints={routePts}
                        className="h-60 sm:h-72 w-full rounded-xl"
                      />

                      {/* Distance & ETA info strip with Step Forward button */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-700">Distance:</span>
                          <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {isEnRouteToHospital ? '2.8 km to Trauma Bay' : getDistanceText(currentMissionIncident)}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-bold text-slate-700">ETA:</span>
                          <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            ~{isEnRouteToHospital ? '6 mins (Driving)' : `${walkingMins} mins (Walking)`}
                          </span>
                        </div>

                        {/* Interactive movement simulation button */}
                        <button
                          type="button"
                          onClick={handleSimulateStepForward}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-95"
                          title="Click to simulate stepping forward along the live route"
                        >
                          <Zap className="w-3.5 h-3.5 fill-slate-950" />
                          <span>Simulate Move Forward (Test Route)</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* GRID: INCIDENT DETAILS & ROLE ACTION STEPS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* SECTION B: INCIDENT BRIEFING */}
                <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="font-black text-slate-900 text-sm">Incident Briefing</h3>
                    <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      {currentMissionIncident.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Exact Address:</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{currentMissionIncident.address}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="font-bold text-slate-500 block">Victims Count:</span>
                        <span className="font-black text-slate-900 text-sm">
                          {currentMissionIncident.victimsCount} Casualty(s)
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500 block">Severity:</span>
                        <span className="font-black text-red-600 text-sm uppercase">
                          {currentMissionIncident.severity}
                        </span>
                      </div>
                    </div>

                    {currentMissionIncident.description && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700">
                        <span className="font-bold text-slate-900 block mb-0.5">Reporter's Note:</span>
                        <p className="italic text-slate-600 leading-relaxed">
                          "{currentMissionIncident.description}"
                        </p>
                      </div>
                    )}

                    {currentMissionIncident.photoUrl && (
                      <div>
                        <span className="font-bold text-slate-500 block mb-1">Scene Photo:</span>
                        <img
                          src={currentMissionIncident.photoUrl}
                          alt="Incident scene"
                          className="w-full h-36 object-cover rounded-xl border border-slate-200"
                        />
                      </div>
                    )}
                  </div>

                  {/* CALL 108 BUTTON */}
                  <div className="pt-2 border-t border-slate-100">
                    <a
                      href="tel:108"
                      className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-red-600/30 cursor-pointer transition-all"
                    >
                      <Phone className="w-4 h-4 fill-white" />
                      <span>Call 108 (Emergency Dispatch Command)</span>
                    </a>
                  </div>
                </div>

                {/* SECTION C: ROLE ACTION STEPS */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <h3 className="font-black text-slate-900 text-sm">Role Action Steps</h3>
                        <p className="text-[11px] text-slate-500 font-medium">Follow navigation and complete each step sequentially</p>
                      </div>
                      <span className="text-[11px] font-bold text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {activeRole.replace('_', ' ')}
                      </span>
                    </div>

                    {/* ====================================================
                        ROLE 1: HELP AT SCENE ACTION STEPS
                        ==================================================== */}
                    {activeRole === 'help_scene' && (
                      <div className="space-y-3 text-xs">
                        {/* Step 1: Navigate to Scene */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-[11px]">
                                1
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Navigate to Scene</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {getDistanceText(currentMissionIncident)} • Follow active blue line
                                </span>
                              </div>
                            </div>
                            {currentHelperRecord?.status === 'arrived' ||
                            currentHelperRecord?.status === 'assistance_given' ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ Reached Scene
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                                In Transit
                              </span>
                            )}
                          </div>

                          {currentHelperRecord?.status !== 'arrived' && currentHelperRecord?.status !== 'assistance_given' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSimulateStepForward}
                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Footprints className="w-3.5 h-3.5" />
                                <span>Simulate Walk Step (Move Closer)</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Step 2: Arrive at Scene */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-[11px]">
                                2
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Arrive at Scene</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  Confirm physical presence to notify 108 dispatcher
                                </span>
                              </div>
                            </div>
                            {currentHelperRecord?.status === 'arrived' ||
                            currentHelperRecord?.status === 'assistance_given' ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ Arrived
                              </span>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={handleMarkArrived}
                            disabled={
                              currentHelperRecord?.status === 'arrived' ||
                              currentHelperRecord?.status === 'assistance_given'
                            }
                            className={`w-full py-2.5 rounded-xl font-black text-xs cursor-pointer transition-all ${
                              currentHelperRecord?.status === 'arrived' ||
                              currentHelperRecord?.status === 'assistance_given'
                                ? 'bg-slate-200 text-slate-500 cursor-default'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            }`}
                          >
                            {currentHelperRecord?.status === 'arrived' || currentHelperRecord?.status === 'assistance_given'
                              ? '✓ Arrived at Scene'
                              : 'I Have Arrived at Scene'}
                          </button>
                        </div>

                        {/* Step 3: CPR & Safe First Aid Guidance */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-[11px]">
                                3
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">First Aid & CPR Beat Coach</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  Follow 110 BPM cardiac rhythm & safe stabilization
                                </span>
                              </div>
                            </div>
                            {currentHelperRecord?.status === 'assistance_given' ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ Assistance Given
                              </span>
                            ) : null}
                          </div>

                          {/* Interactive CPR Metronome Widget */}
                          <div className="p-3 bg-red-50 rounded-xl border border-red-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Heart className={`w-5 h-5 text-red-600 ${isCprMetronomeActive ? 'animate-bounce' : ''}`} />
                                <span className="font-black text-red-950 text-xs">
                                  AHA 110 BPM Chest Compression Metronome
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setCprSoundEnabled(!cprSoundEnabled)}
                                className="p-1 rounded text-red-700 hover:bg-red-100 cursor-pointer"
                                title="Toggle Sound"
                              >
                                {cprSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                              </button>
                            </div>

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setIsCprMetronomeActive(!isCprMetronomeActive)}
                                className={`flex-1 py-2 rounded-lg font-black text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                                  isCprMetronomeActive
                                    ? 'bg-red-600 text-white shadow-md'
                                    : 'bg-white border border-red-300 text-red-700 hover:bg-red-100'
                                }`}
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>{isCprMetronomeActive ? 'Stop Metronome' : 'Start 110 BPM Metronome'}</span>
                              </button>

                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                                  cprBeatPulse ? 'bg-red-600 text-white scale-110 shadow-lg' : 'bg-red-200 text-red-800'
                                }`}
                              >
                                PUSH
                              </div>
                            </div>
                          </div>

                          {/* Quick Safety Checkboxes */}
                          <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={safetyChecklist.trafficSafe}
                                onChange={(e) => setSafetyChecklist({ ...safetyChecklist, trafficSafe: e.target.checked })}
                                className="rounded text-blue-600 cursor-pointer"
                              />
                              <span>Scene safe from oncoming traffic / fire hazards</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={safetyChecklist.airwayClear}
                                onChange={(e) => setSafetyChecklist({ ...safetyChecklist, airwayClear: e.target.checked })}
                                className="rounded text-blue-600 cursor-pointer"
                              />
                              <span>Check responsiveness & gently tilt head back to open airway</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={safetyChecklist.bleedingControlled}
                                onChange={(e) =>
                                  setSafetyChecklist({ ...safetyChecklist, bleedingControlled: e.target.checked })
                                }
                                className="rounded text-blue-600 cursor-pointer"
                              />
                              <span>Continuous direct pressure applied on external wounds</span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={handleMarkAssistanceGiven}
                            disabled={currentHelperRecord?.status === 'assistance_given'}
                            className={`w-full py-2.5 rounded-xl font-black text-xs cursor-pointer transition-all ${
                              currentHelperRecord?.status === 'assistance_given'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            }`}
                          >
                            {currentHelperRecord?.status === 'assistance_given'
                              ? '✓ Safe Assistance Completed • Standing by for Ambulance'
                              : 'Mark Assistance Completed'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ====================================================
                        ROLE 2: TRANSPORT VICTIM ACTION STEPS
                        ==================================================== */}
                    {activeRole === 'transport_victim' && (
                      <div className="space-y-3 text-xs">
                        {/* Step 1: Reach Casualty */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-[11px]">
                                1
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Reach Casualty Location</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {getDistanceText(currentMissionIncident)}
                                </span>
                              </div>
                            </div>
                            {currentHelperRecord?.status === 'arrived' || transportStage !== 'to_scene' ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ At Scene
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                                En Route
                              </span>
                            )}
                          </div>

                          {transportStage === 'to_scene' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSimulateStepForward}
                                className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Footprints className="w-3.5 h-3.5" />
                                <span>Simulate Move Closer</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleMarkArrived}
                                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs cursor-pointer shadow-xs"
                              >
                                I Have Arrived at Casualty
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Step 2: Patient Assessment & Destination ER */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black flex items-center justify-center text-[11px]">
                                2
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Patient Assessment & Destination</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  Confirm conscious and no spinal/neck fractures
                                </span>
                              </div>
                            </div>
                            {transportStage === 'in_transit' || transportStage === 'at_hospital' ? (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ Secured
                              </span>
                            ) : null}
                          </div>

                          <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
                            <span className="font-bold text-slate-700 block text-[11px]">Destination Hospital:</span>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <Hospital className="w-4 h-4 text-emerald-600" />
                              <span>{transportHospital.name}</span>
                            </div>
                          </div>

                          {transportStage === 'to_scene' && (
                            <button
                              type="button"
                              onClick={handleMarkAssistanceGiven}
                              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs cursor-pointer shadow-sm"
                            >
                              Victim Secured in Vehicle • Begin Hospital ER Route
                            </button>
                          )}
                        </div>

                        {/* Step 3: Live Hospital Route Navigation */}
                        {transportStage === 'in_transit' && (
                          <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-300 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Car className="w-5 h-5 text-emerald-700" />
                                <div>
                                  <span className="font-black text-emerald-950 block">Live Route to Hospital ER</span>
                                  <span className="text-[11px] text-emerald-800 font-medium">
                                    Drive with hazard lights on • Trauma bay team notified
                                  </span>
                                </div>
                              </div>
                              <span className="text-[11px] font-black uppercase text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                                In Transit
                              </span>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSimulateStepForward}
                                className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>Simulate Driving Towards ER</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleFinishTransportHospital}
                                className="flex-1 py-2 bg-emerald-900 hover:bg-black text-white rounded-lg font-black text-xs cursor-pointer shadow-sm"
                              >
                                Arrived at Hospital ER
                              </button>
                            </div>
                          </div>
                        )}

                        {transportStage === 'at_hospital' ? (
                          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-300 text-emerald-950 space-y-3">
                            <div className="flex items-center gap-2 font-black text-xs text-emerald-900">
                              <Check className="w-4 h-4 text-emerald-700" />
                              <span>Casualty handed over to Hospital ER Trauma Bay. Mission successfully accomplished!</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleEndMission}
                              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Finish & Conclude Assistance Mission</span>
                            </button>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                            <span className="text-[11px] text-slate-500 font-medium">Completed or stepping down?</span>
                            <button
                              type="button"
                              onClick={handleEndMission}
                              className="text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                            >
                              End Mission Now
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ====================================================
                        ROLE 3: GUIDE AMBULANCE ACTION STEPS
                        ==================================================== */}
                    {activeRole === 'guide_ambulance' && (
                      <div className="space-y-3 text-xs">
                        {/* Step 1: Reach Intersection */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black flex items-center justify-center text-[11px]">
                                1
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Navigate to Main Road Intersection</span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  Spot oncoming ambulance with high visibility
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                              Active
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSimulateStepForward}
                              className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Footprints className="w-3.5 h-3.5" />
                              <span>Simulate Walk to Junction</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleMarkArrived}
                              className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-black text-xs cursor-pointer shadow-xs"
                            >
                              I Am at the Street Junction
                            </button>
                          </div>
                        </div>

                        {/* Step 2: Signal Ambulance with Screen Strobe */}
                        <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black flex items-center justify-center text-[11px]">
                                2
                              </span>
                              <div>
                                <span className="font-black text-slate-900 block">Signal Approaching Ambulance</span>
                                <span className="text-[11px] text-purple-800 font-medium">
                                  Turn phone into high-contrast flashing beacon
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsScreenStrobeActive(true)}
                            className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                          >
                            <Radio className="w-4 h-4 animate-ping" />
                            <span>Launch High-Visibility Screen Strobe</span>
                          </button>
                        </div>

                        {/* Step 3: Relay Roadblocks & Alley Info */}
                        <form onSubmit={handleSendGuideUpdate} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black flex items-center justify-center text-[11px]">
                                3
                              </span>
                              <span className="font-black text-slate-900">Relay Route Status to 108 & Crew</span>
                            </div>
                            {guideSentNotice && (
                              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Sent to AMB
                              </span>
                            )}
                          </div>

                          {/* Quick Pills */}
                          <div className="flex flex-wrap gap-1.5">
                            {['Narrow alley ahead', 'Center lane clear', 'Waiting at Gate 3', 'Crowd cleared'].map((pill) => (
                              <button
                                key={pill}
                                type="button"
                                onClick={() => handleQuickAddGuidePill(pill)}
                                className="px-2 py-1 bg-white hover:bg-purple-100 text-slate-700 rounded-md border border-slate-200 text-[11px] font-medium cursor-pointer transition-colors"
                              >
                                + {pill}
                              </button>
                            ))}
                          </div>

                          <input
                            type="text"
                            value={guideRoadBlocksInput}
                            onChange={(e) => setGuideRoadBlocksInput(e.target.value)}
                            placeholder="Type road info or tap pills above..."
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs"
                          />

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="submit"
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Relay to Ambulance</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* SAFETY TIPS */}
                  <div className="bg-amber-50 rounded-2xl border border-amber-300 p-5 space-y-2 text-xs text-amber-950">
                    <div className="flex items-center gap-2 font-black text-amber-900 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Safety Instructions for {activeRole.replace('_', ' ').toUpperCase()}</span>
                    </div>

                    {activeRole === 'help_scene' && (
                      <ul className="space-y-1.5 list-disc pl-4 text-amber-950/90 leading-relaxed font-medium">
                        <li><strong>Do not move the victim</strong> if neck or spinal injury is suspected, unless imminent life hazards exist.</li>
                        <li><strong>Apply firm, continuous pressure</strong> to active bleeding wounds with clean cloth or sterile dressing.</li>
                        <li><strong>Maintain airway & breathing</strong>. Keep crowd back and provide continuous reassurance until official paramedic arrival.</li>
                      </ul>
                    )}

                    {activeRole === 'transport_victim' && (
                      <ul className="space-y-1.5 list-disc pl-4 text-amber-950/90 leading-relaxed font-medium">
                        <li><strong>Proceed only if safe and appropriate</strong> to move the victim.</li>
                        <li>Never transport unconscious, head-injured, or spinal-trauma victims in a personal vehicle.</li>
                        <li>Drive safely with hazard lights blinking; hospital emergency team has been alerted in advance.</li>
                      </ul>
                    )}

                    {activeRole === 'guide_ambulance' && (
                      <ul className="space-y-1.5 list-disc pl-4 text-amber-950/90 leading-relaxed font-medium">
                        <li><strong>Remain safely on the sidewalk</strong> or off active vehicular traffic lanes.</li>
                        <li>Wave with phone screen strobe or flashlight to visually guide the approaching ambulance into the correct alley.</li>
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* In-UI Confirmation Modal to End Active Assistance Mission (Replaces blocked window.confirm) */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">End Assistance Mission?</h3>
                  <span className="text-xs text-slate-500 font-mono">
                    Incident #{currentMissionIncident?.id || 'Active'} • {activeRole?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEndConfirmModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to end or exit this emergency assistance mission? Live navigation will conclude and your civilian response slot will be cleared or completed.
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Assistance logs and timestamps have been saved to the incident audit trail.</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowEndConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Keep Mission Active
              </button>
              <button
                type="button"
                onClick={executeConfirmEndMission}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-colors"
              >
                Yes, End Mission Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
