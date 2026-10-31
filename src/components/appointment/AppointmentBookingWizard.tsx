// Source: Google Maps Platform Code Assist
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Stethoscope,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Mic,
  MicOff,
  Camera,
  Upload,
  X,
  ShieldAlert,
  CreditCard,
  QrCode,
  FileText,
  Search,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Info,
  Check,
  AlertCircle,
  Volume2,
  Navigation,
  Compass,
  Star,
  ExternalLink,
  Phone,
  SlidersHorizontal,
  Route,
  UserCheck,
  CheckCircle,
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  CalendarClock,
  Timer,
  User,
  BadgeCheck,
  Video,
  HelpCircle,
  Settings,
} from 'lucide-react';
import { AppState, appStore, generateUniquePatientId, validatePatientIdFormat } from '../../services/store';
import { AuthUser, authService, DEMO_ACCOUNTS } from '../../services/auth';
import { Hospital, Doctor, PatientProfile, AppointmentRecord } from '../../types';
import { GoogleMapsView, MarkerItem } from '../GoogleMapsView';

// The 16 allowed specialties strictly specified
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

export interface AppointmentBookingWizardProps {
  appState: AppState;
  currentUser: AuthUser | null;
  onNavigateToAppointments?: () => void;
  onOpenSOS?: () => void;
  initialStep?: number;
}

// Popular pre-configured Delhi NCR areas for quick 1-click pin/area selection
const POPULAR_AREAS = [
  { name: 'Connaught Place (Central)', lat: 28.6315, lng: 77.2167 },
  { name: 'South Extension / AIIMS', lat: 28.5729, lng: 77.2223 },
  { name: 'Dwarka Sector 12', lat: 28.5921, lng: 77.0460 },
  { name: 'Okhla Phase II', lat: 28.5355, lng: 77.2731 },
  { name: 'DLF Cyber City (Gurugram)', lat: 28.4950, lng: 77.0895 },
  { name: 'Sector 18 (Noida)', lat: 28.5355, lng: 77.3910 },
];

// Unregistered nearby hospitals found through Google Places simulation (not on MediTrack network)
interface ExternalHospital {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  rating: number;
  specialties: string[];
  isRegisteredOnMediTrack: false;
}

const EXTERNAL_GOOGLE_HOSPITALS: ExternalHospital[] = [
  {
    id: 'g-hosp-1',
    name: 'Max Super Specialty Hospital, Saket',
    address: '1, 2, Press Enclave Marg, Saket Institutional Area, New Delhi',
    lat: 28.5244,
    lng: 77.2167,
    phone: '+91 11 2651 5050',
    rating: 4.6,
    specialties: ['Cardiology', 'Oncology', 'Neurology', 'Orthopedics'],
    isRegisteredOnMediTrack: false,
  },
  {
    id: 'g-hosp-2',
    name: 'Fortis Escorts Heart Institute',
    address: 'Okhla Road, Sukhdev Vihar Metro Station, New Delhi',
    lat: 28.5582,
    lng: 77.2778,
    phone: '+91 11 4713 5000',
    rating: 4.5,
    specialties: ['Cardiology', 'Pediatric Cardiology', 'General Medicine'],
    isRegisteredOnMediTrack: false,
  },
];

export const AppointmentBookingWizard: React.FC<AppointmentBookingWizardProps> = ({
  appState,
  currentUser,
  onNavigateToAppointments,
  onOpenSOS,
  initialStep = 1,
}) => {
  // Wizard steps: 1: Problem, 2: Hospital, 3: Doctor and Time, 4: Your Details, 5: Payment, 6: Confirmation
  const [currentStep, setCurrentStep] = useState<number>(initialStep);

  // -------------------------------------------------------------
  // STEP 1 STATE: DESCRIBE THE HEALTH PROBLEM
  // -------------------------------------------------------------
  const MAX_PROBLEM_CHARS = 500;
  const [problemSummary, setProblemSummary] = useState('');

  // Voice recording (Web Speech API)
  const [speechLanguage, setSpeechLanguage] = useState<'en-IN' | 'hi-IN' | 'pa-IN'>('en-IN');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const speechRecognitionRef = useRef<any>(null);

  // Camera capture
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // File uploads (Image / PDF, 5MB limit)
  const MAX_FILE_SIZE_MB = 5;
  const [attachedFiles, setAttachedFiles] = useState<
    { name: string; url: string; size: string; type: 'image' | 'pdf' }[]
  >([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Privacy consent checkbox
  const [privacyConsent, setPrivacyConsent] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Permission Management Popup & Guide State
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionModalFocus, setPermissionModalFocus] = useState<'mic' | 'camera' | 'both'>('mic');
  const [micPermissionStatus, setMicPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionRequestNotice, setPermissionRequestNotice] = useState<string | null>(null);
  const [permissionGuideBrowser, setPermissionGuideBrowser] = useState<'chrome' | 'safari' | 'firefox'>('chrome');

  // AI Specialty matching
  const [isMatchingSpecialty, setIsMatchingSpecialty] = useState(false);
  const [hasMatchedOnce, setHasMatchedOnce] = useState(false);
  const [matchedSpecialty, setMatchedSpecialty] = useState<AllowedSpecialty>('General Medicine');
  const [suggestedAlternatives, setSuggestedAlternatives] = useState<AllowedSpecialty[]>([]);
  const [aiMatchReason, setAiMatchReason] = useState<string>('');
  const [urgencyLevel, setUrgencyLevel] = useState<'Routine' | 'Soon' | 'Urgent'>('Routine');
  const [isEmergencyDetected, setIsEmergencyDetected] = useState(false);
  const [aiCallFailed, setAiCallFailed] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [matchSource, setMatchSource] = useState<'ai' | 'keywords'>('ai');

  // -------------------------------------------------------------
  // STEP 2 STATE: FIND & SELECT HOSPITALS
  // -------------------------------------------------------------
  // 1. Patient Location (No hardcoded default location!)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'locating' | 'granted' | 'denied' | 'manual'>('prompt');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isDroppingPinOnMap, setIsDroppingPinOnMap] = useState(false);

  // 2. Real Distances & Distance Matrix
  const [hospitalDistances, setHospitalDistances] = useState<
    Record<string, { distanceKm: number; durationMins: number; distanceText: string; durationText: string; isRealRoute: boolean }>
  >({});
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const [distanceProviderNotice, setDistanceProviderNotice] = useState<string | null>(null);

  // 3. Filters
  const [radiusKm, setRadiusKm] = useState<number>(35); // Configurable 30 to 40 km standard
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [filterDocAvailableToday, setFilterDocAvailableToday] = useState(false);
  const [hospitalSearchTerm, setHospitalSearchTerm] = useState('');

  // 4. Hospital Selection
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // 5. "View Hospital Details" Panel Modal & Tabs
  const [detailedHospital, setDetailedHospital] = useState<Hospital | null>(null);
  const [detailActiveTab, setDetailActiveTab] = useState<'reviews' | 'doctors' | 'directions'>('reviews');
  const [placesReviewsData, setPlacesReviewsData] = useState<{
    rating: number | null;
    userRatingsTotal: number | null;
    reviews: { author_name: string; rating: number; text: string; relative_time_description?: string }[];
    isFallback: boolean;
    message?: string;
    attribution?: string;
  } | null>(null);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // -------------------------------------------------------------
  // STEP 3 STATE: DOCTOR, DATE AND TIME
  // -------------------------------------------------------------
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [showAllDoctorsAtHospital, setShowAllDoctorsAtHospital] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-30');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [serverDoctorFee, setServerDoctorFee] = useState<number>(650);
  const [slotsList, setSlotsList] = useState<
    { time: string; status: 'available' | 'booked' | 'held_by_you' | 'held_by_other'; isAvailable: boolean; heldUntil?: number }[]
  >([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [leaveOrHolidayNotice, setLeaveOrHolidayNotice] = useState<string | null>(null);

  // 10-Minute Hold Reservation state & Timer
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState<number>(0);
  const [isHoldingSlot, setIsHoldingSlot] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // STEP 4 STATE: PATIENT ID CHECK & YOUR DETAILS
  // -------------------------------------------------------------
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [isVerifiedPatient, setIsVerifiedPatient] = useState<boolean>(
    Boolean(currentUser && (currentUser.portal === 'patient' || currentUser.role === 'patient'))
  );
  const [verifiedPatientId, setVerifiedPatientId] = useState<string>(currentUser?.customId || '');

  // Patient details form
  const [patientFullName, setPatientFullName] = useState<string>(currentUser?.name || '');
  const [patientEmail, setPatientEmail] = useState<string>(currentUser?.email || '');
  const [patientPhone, setPatientPhone] = useState<string>(currentUser?.phone || '');
  const [patientDob, setPatientDob] = useState<string>('1994-08-14');
  const [patientGender, setPatientGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [patientBloodGroup, setPatientBloodGroup] = useState<string>('B+');
  const [patientAllergies, setPatientAllergies] = useState<string>('');
  const [patientChronicConditions, setPatientChronicConditions] = useState<string>('');
  const [patientEmergencyContactName, setPatientEmergencyContactName] = useState<string>('');
  const [patientEmergencyContactPhone, setPatientEmergencyContactPhone] = useState<string>('');

  // Login form for unauthenticated users
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Inline Registration form
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDob, setRegDob] = useState('1998-04-12');
  const [regGender, setRegGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [regBloodGroup, setRegBloodGroup] = useState('O+');
  const [regAllergies, setRegAllergies] = useState('');
  const [regEmergencyContactName, setRegEmergencyContactName] = useState('');
  const [regEmergencyContactPhone, setRegEmergencyContactPhone] = useState('');
  const [regPassword, setRegPassword] = useState('Password123');

  // Verification & Phone OTP state
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [simulatedOtpCode, setSimulatedOtpCode] = useState<string | null>(null);
  const [enteredOtpCode, setEnteredOtpCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regSuccessMessage, setRegSuccessMessage] = useState<string | null>(null);

  // Appointment Record State
  const [createdAppointment, setCreatedAppointment] = useState<AppointmentRecord | null>(null);
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [createAppointmentError, setCreateAppointmentError] = useState<string | null>(null);

  // 10-Minute Hold Reservation countdown timer
  useEffect(() => {
    if (!holdToken || !holdExpiresAt) {
      setHoldSecondsRemaining(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.floor((holdExpiresAt - Date.now()) / 1000));
      setHoldSecondsRemaining(remaining);
      if (remaining <= 0) {
        setHoldToken(null);
        setHoldExpiresAt(null);
        setSelectedTimeSlot(null);
        setHoldError('Your 10-minute slot reservation hold has expired. Please select a time slot again.');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdToken, holdExpiresAt]);

  // Sync patient details if logged-in user changes
  useEffect(() => {
    if (currentUser && (currentUser.portal === 'patient' || currentUser.role === 'patient')) {
      const patient =
        appStore.getPatientBySession(currentUser) ||
        appState.patients.find((p) => p.email?.toLowerCase() === currentUser.email?.toLowerCase());

      if (patient) {
        setPatientFullName(patient.name);
        setPatientEmail(patient.email || currentUser.email || '');
        setPatientPhone(patient.phone || currentUser.phone || '');
        setPatientGender(patient.gender || 'Female');
        setPatientBloodGroup(patient.bloodGroup || 'B+');
        setPatientAllergies((patient.allergies || []).join(', '));
        setPatientChronicConditions((patient.chronicConditions || []).join(', '));
        setPatientEmergencyContactName(patient.emergencyContacts?.[0]?.name || '');
        setPatientEmergencyContactPhone(patient.emergencyContacts?.[0]?.phone || '');
        setVerifiedPatientId(patient.uniquePatientId);
        setIsVerifiedPatient(true);
      } else {
        setPatientFullName(currentUser.name);
        setPatientEmail(currentUser.email || '');
        setPatientPhone(currentUser.phone || '');
        setVerifiedPatientId(currentUser.customId || 'PT00234');
        setIsVerifiedPatient(true);
      }
    }
  }, [currentUser, appState.patients]);

  // Active Patient Profile Resolution (safe for brand-new users)
  const activePatient: PatientProfile = currentUser
    ? appStore.getPatientBySession(currentUser) ||
      appState.patients.find((p) => p.email?.toLowerCase() === currentUser.email?.toLowerCase()) || {
        id: currentUser.customId || currentUser.uid || 'pat-new',
        name: currentUser.name || 'New Patient',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        age: 30,
        gender: 'Other',
        bloodGroup: 'O+',
        uniquePatientId: 'PT-NEW',
        allergies: [],
        chronicConditions: [],
        currentMedicines: [],
        vaccinations: [],
        emergencyContacts: [],
      }
    : {
        id: 'guest',
        name: 'Guest Patient',
        email: '',
        phone: '',
        age: 30,
        gender: 'Other',
        bloodGroup: 'O+',
        uniquePatientId: 'PT-GUEST',
        allergies: [],
        chronicConditions: [],
        currentMedicines: [],
        vaccinations: [],
        emergencyContacts: [],
      };

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Query initial permission states if supported
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as any })
        .then((status) => {
          setMicPermissionStatus(status.state as any);
          status.onchange = () => {
            setMicPermissionStatus(status.state as any);
          };
        })
        .catch(() => {
          // Permissions query for mic not supported in some browsers
        });

      navigator.permissions
        .query({ name: 'camera' as any })
        .then((status) => {
          setCameraPermissionStatus(status.state as any);
          status.onchange = () => {
            setCameraPermissionStatus(status.state as any);
          };
        })
        .catch(() => {
          // Permissions query for camera not supported in some browsers
        });
    }
  }, []);

  // -------------------------------------------------------------
  // STEP 1 HANDLERS
  // -------------------------------------------------------------
  const startSpeechRecognitionInternal = () => {
    setSpeechError(null);
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechError('Web Speech API is not supported in this browser. Please type your problem description or choose a sample.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = speechLanguage;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecordingVoice(true);
        setSpeechError(null);
        setMicPermissionStatus('granted');
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript + ' ';
        }
        setVoiceTranscript(currentTranscript.trim());
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsRecordingVoice(false);
        if (event.error === 'not-allowed') {
          setMicPermissionStatus('denied');
          setSpeechError('Microphone permission was denied. Please allow microphone access in your browser.');
          // Open interactive permission notification modal immediately
          setShowPermissionModal(true);
          setPermissionModalFocus('mic');
        } else if (event.error === 'no-speech') {
          setSpeechError('No speech detected. Please speak clearly into your microphone.');
        } else {
          setSpeechError(`Speech recognition notice: ${event.error}. You can also type directly.`);
        }
      };

      recognition.onend = () => {
        setIsRecordingVoice(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setIsRecordingVoice(false);
      setSpeechError('Could not start microphone recording. Please allow microphone access in your browser.');
      setShowPermissionModal(true);
      setPermissionModalFocus('mic');
    }
  };

  const toggleSpeechRecording = () => {
    setSpeechError(null);
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setSpeechError('Web Speech API is not supported in this browser. Please type your problem description.');
      return;
    }

    if (isRecordingVoice) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          console.warn('Speech stop error:', e);
        }
      }
      setIsRecordingVoice(false);
      return;
    }

    // If permission was already permanently blocked/denied, open the helpful popup right away
    if (micPermissionStatus === 'denied') {
      setSpeechError('Microphone permission was denied. Please allow microphone access in your browser.');
      setShowPermissionModal(true);
      setPermissionModalFocus('mic');
      return;
    }

    startSpeechRecognitionInternal();
  };

  const handleGrantPermissions = async (type: 'mic' | 'camera' | 'both') => {
    setIsRequestingPermissions(true);
    setPermissionRequestNotice(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsRequestingPermissions(false);
      setPermissionRequestNotice('Media devices API is not supported in this browser environment.');
      return;
    }

    try {
      if (type === 'mic') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setMicPermissionStatus('granted');
        setSpeechError(null);
        setPermissionRequestNotice('Microphone permission granted successfully! Starting speech recognition...');
        setTimeout(() => {
          setShowPermissionModal(false);
          startSpeechRecognitionInternal();
        }, 700);
      } else if (type === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        mediaStreamRef.current = stream;
        setIsCameraActive(true);
        setCameraPermissionStatus('granted');
        setCameraError(null);
        setPermissionRequestNotice('Camera permission granted successfully!');
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.warn);
          }
          setShowPermissionModal(false);
        }, 600);
      } else {
        // Both microphone & camera
        let micSuccess = false;
        let camSuccess = false;

        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getTracks().forEach((t) => t.stop());
          setMicPermissionStatus('granted');
          setSpeechError(null);
          micSuccess = true;
        } catch (err: any) {
          console.warn('Mic request error in both:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setMicPermissionStatus('denied');
          }
        }

        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          camStream.getTracks().forEach((t) => t.stop());
          setCameraPermissionStatus('granted');
          setCameraError(null);
          camSuccess = true;
        } catch (err: any) {
          console.warn('Camera request error in both:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setCameraPermissionStatus('denied');
          }
        }

        if (micSuccess && camSuccess) {
          setPermissionRequestNotice('Both Microphone and Camera permissions granted successfully!');
          setTimeout(() => {
            setShowPermissionModal(false);
          }, 800);
        } else if (micSuccess || camSuccess) {
          setPermissionRequestNotice(
            `${micSuccess ? 'Microphone' : 'Camera'} granted! ${
              !micSuccess ? 'Microphone' : 'Camera'
            } remains blocked in browser settings.`
          );
        } else {
          setPermissionRequestNotice(
            'Browser blocked access. Please follow the instructions below to enable access via URL bar.'
          );
        }
      }
    } catch (err: any) {
      console.warn('handleGrantPermissions error:', err);
      if (type === 'mic' || type === 'both') {
        setMicPermissionStatus('denied');
        setSpeechError('Microphone permission was denied. Please allow microphone access in your browser.');
      }
      if (type === 'camera' || type === 'both') {
        setCameraPermissionStatus('denied');
        setCameraError('Camera permission denied. Please allow camera access in your browser.');
      }
      setPermissionRequestNotice(
        'Permission request was blocked. Please click the 🔒 lock icon in your browser URL bar to Allow.'
      );
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  const handleSimulateVoiceInput = (sampleText: string) => {
    setVoiceTranscript(sampleText);
    setSpeechError(null);
    setShowPermissionModal(false);
  };

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported by your browser. Please upload an image instead.');
      return;
    }

    if (cameraPermissionStatus === 'denied') {
      setCameraError('Camera permission denied. Please allow camera access in your browser or upload a photo.');
      setShowPermissionModal(true);
      setPermissionModalFocus('camera');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
      setCameraPermissionStatus('granted');

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.warn('Camera video play error:', err);
          });
        }
      }, 150);
    } catch (err: any) {
      console.warn('Camera access denied or error:', err);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermissionStatus('denied');
        setCameraError('Camera permission denied. Please allow camera access in your browser or upload a photo.');
        setShowPermissionModal(true);
        setPermissionModalFocus('camera');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on your device. You can upload an image file instead.');
      } else {
        setCameraError('Unable to open camera. Please upload an image or PDF instead.');
      }
    }
  };

  const closeCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const captureCameraPhoto = () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedPhotos((prev) => [...prev, dataUrl]);
      }
    } catch (err) {
      console.error('Failed to capture frame from video:', err);
    }
    closeCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxBytes) {
        setUploadError(`"${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB size limit. Please upload a smaller file.`);
        continue;
      }

      const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');

      if (!isPdf && !isImg) {
        setUploadError(`"${file.name}" has an unsupported format. Please upload JPG, PNG, or PDF.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (loadEv) => {
        const resultUrl = loadEv.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            url: resultUrl,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: isPdf ? 'pdf' : 'image',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const checkEmergencyKeywords = (text: string) => {
    const emergencyKeywords = [
      'chest pain',
      'pressure in chest',
      'heart attack',
      'shortness of breath',
      'difficulty breathing',
      "can't breathe",
      'struggling to breathe',
      'severe bleeding',
      'heavy bleeding',
      'unconscious',
      'fainted',
      'passed out',
      'stroke',
      'slurred speech',
      'facial drooping',
      'sudden weakness',
      'numbness on one side',
      'anaphylaxis',
      'choking',
    ];
    const lower = text.toLowerCase();
    return emergencyKeywords.some((kw) => lower.includes(kw));
  };

  const buildStructuredCaseSummary = () => {
    const rawSummary = problemSummary.trim() || 'No written problem summary provided';
    const transcript = voiceTranscript.trim() || 'No voice transcript';

    const allergiesStr =
      activePatient.allergies && activePatient.allergies.length > 0
        ? activePatient.allergies.join(', ')
        : 'None recorded';

    const conditionsStr =
      activePatient.chronicConditions && activePatient.chronicConditions.length > 0
        ? activePatient.chronicConditions.join(', ')
        : 'None recorded';

    return {
      problemSummary: rawSummary,
      voiceTranscript: transcript,
      patientProfile: {
        age: activePatient.age || 30,
        gender: activePatient.gender || 'Not specified',
        allergies: activePatient.allergies || [],
        chronicConditions: activePatient.chronicConditions || [],
      },
      attachedPhotosCount: capturedPhotos.length,
      attachedReportsCount: attachedFiles.length,
      formattedText: `CHIEF COMPLAINT:\n${rawSummary}\n\nVOICE NOTES:\n${transcript}\n\nPATIENT PROFILE:\n• Age: ${
        activePatient.age || 'Not specified'
      } | Gender: ${activePatient.gender || 'Not specified'}\n• Known Allergies: ${allergiesStr}\n• Chronic Conditions: ${conditionsStr}\n\nATTACHMENTS:\n• ${
        capturedPhotos.length
      } photo(s) captured\n• ${attachedFiles.length} file(s) attached`,
    };
  };

  const runSpecialtyMatching = async () => {
    setValidationError(null);
    setAiErrorMessage(null);

    const combinedText = `${problemSummary} ${voiceTranscript}`.trim();
    const hasMedia = capturedPhotos.length > 0 || attachedFiles.length > 0;

    if (!combinedText && !hasMedia) {
      setValidationError('Please enter a brief problem summary, speak your problem, or attach a photo/report.');
      return;
    }

    if (hasMedia && !privacyConsent) {
      setValidationError('Please accept the privacy consent checkbox to allow sharing photos with the AI matcher.');
      return;
    }

    const structuredCase = buildStructuredCaseSummary();
    const isLocalEmergency = checkEmergencyKeywords(combinedText);
    if (isLocalEmergency) {
      setIsEmergencyDetected(true);
    }

    setIsMatchingSpecialty(true);
    setAiCallFailed(false);

    try {
      const response = await fetch('/api/appointments/match-specialty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: problemSummary,
          voiceTranscript,
          photos: privacyConsent ? [...capturedPhotos, ...attachedFiles.map((f) => f.name)] : [],
          privacyConsent: !!privacyConsent,
          patientProfile: structuredCase.patientProfile,
          age: structuredCase.patientProfile?.age,
          gender: structuredCase.patientProfile?.gender,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const chosenSpecialty = ALLOWED_SPECIALTIES.includes(data.specialty) ? data.specialty : 'Other';
      const alternatives = Array.isArray(data.alternatives)
        ? data.alternatives.filter((a: any) => ALLOWED_SPECIALTIES.includes(a) && a !== chosenSpecialty)
        : [];

      setMatchedSpecialty(chosenSpecialty as AllowedSpecialty);
      setSuggestedAlternatives(alternatives.slice(0, 2) as AllowedSpecialty[]);
      setAiMatchReason(data.reason || 'Clinical triage evaluation recommended based on described presentation.');
      setUrgencyLevel(data.urgency || (isLocalEmergency ? 'Urgent' : 'Routine'));
      setIsEmergencyDetected(data.isEmergency === true || isLocalEmergency);
      setMatchSource(data.source === 'keywords' ? 'keywords' : 'ai');
      setHasMatchedOnce(true);
    } catch (err: any) {
      console.warn('AI Specialty Matching failed, applying keyword fallback:', err);
      setAiCallFailed(true);
      setAiErrorMessage('AI specialty matching is currently unreachable. Suggested specialty calculated via clinical keyword heuristics.');

      const lower = combinedText.toLowerCase();
      let fallbackSpec: AllowedSpecialty = 'General Medicine';
      let reason = 'Constitutional, non-localized symptoms (fever, tiredness, body ache) suggest General Medicine evaluation.';

      if (lower.includes('chest') || lower.includes('heart') || lower.includes('palpitation')) {
        fallbackSpec = 'Cardiology';
        reason = 'Cardiovascular symptoms such as chest pain or palpitations suggest cardiology evaluation.';
      } else if (lower.includes('bone') || lower.includes('fracture') || lower.includes('joint') || lower.includes('knee') || lower.includes('back pain') || lower.includes('fall')) {
        fallbackSpec = 'Orthopedics';
        reason = 'Musculoskeletal discomfort, knee pain, or injury following a fall warrants orthopedic evaluation.';
      } else if (lower.includes('skin') || lower.includes('rash') || lower.includes('itch') || lower.includes('acne')) {
        fallbackSpec = 'Dermatology';
        reason = 'Cutaneous irritation, rash, or pruritus on skin suggests dermatological assessment.';
      } else if (lower.includes('headache') || lower.includes('seizure') || lower.includes('numbness') || lower.includes('paralysis') || lower.includes('dizziness') || lower.includes('migraine')) {
        fallbackSpec = 'Neurology';
        reason = 'Neurological symptoms including severe headache, dizziness, or numbness warrant neurology consultation.';
      } else if (
        lower.includes('child') ||
        lower.includes('baby') ||
        lower.includes('infant') ||
        lower.includes('pediatric') ||
        /\b([0-9]|1[0-5])\s*(?:year|yr)s?\s*old\b/i.test(combinedText)
      ) {
        fallbackSpec = 'Pediatrics';
        reason = 'Pediatric age group with acute symptoms requires consultation with a pediatrician.';
      } else if (/\bear\b/i.test(combinedText) || lower.includes('nose') || lower.includes('throat') || lower.includes('sinus')) {
        fallbackSpec = 'ENT';
        reason = 'Ear discomfort, sore throat, or sinus symptoms indicate evaluation by an ENT specialist.';
      } else if (lower.includes('pregnancy') || lower.includes('period') || lower.includes('uterus') || lower.includes('gynecol')) {
        fallbackSpec = 'Gynecology';
        reason = 'Reproductive health and menstrual concerns align with gynecology.';
      } else if (lower.includes('stomach') || lower.includes('vomiting') || lower.includes('acidity') || lower.includes('liver')) {
        fallbackSpec = 'Gastroenterology';
        reason = 'Gastrointestinal complaints including stomach pain, acidity, or vomiting suggest gastroenterology.';
      } else if (lower.includes('breathing') || lower.includes('asthma') || lower.includes('cough') || lower.includes('wheezing') || lower.includes('lung')) {
        fallbackSpec = 'Pulmonology';
        reason = 'Respiratory symptoms, coughing, or breathing difficulty indicate pulmonology evaluation.';
      } else if (lower.includes('eye') || lower.includes('vision') || lower.includes('blurred')) {
        fallbackSpec = 'Ophthalmology';
        reason = 'Ophthalmic complaints or visual disturbances warrant an ophthalmology consultation.';
      } else if (lower.includes('tooth') || lower.includes('teeth') || lower.includes('gum') || lower.includes('dental')) {
        fallbackSpec = 'Dentistry';
        reason = 'Oral and dental symptoms warrant evaluation by a dentist.';
      }

      setMatchedSpecialty(fallbackSpec);
      setSuggestedAlternatives(fallbackSpec === 'General Medicine' ? ['Other'] : ['General Medicine']);
      setAiMatchReason(reason);
      setUrgencyLevel(isLocalEmergency ? 'Urgent' : 'Routine');
      setIsEmergencyDetected(isLocalEmergency);
      setMatchSource('keywords');
      setHasMatchedOnce(true);
    } finally {
      setIsMatchingSpecialty(false);
    }
  };

  // -------------------------------------------------------------
  // STEP 2: LOCATION & DISTANCE HANDLERS
  // -------------------------------------------------------------
  // 1. Request Browser Geolocation with permission
  const requestBrowserLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      setLocationError('Geolocation is not supported by your browser. Please type your city/area below or drop a pin.');
      return;
    }

    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setLocationStatus('granted');

        // Reverse geocode address via server proxy
        try {
          const res = await fetch(`/api/maps/geocode?lat=${coords.lat}&lng=${coords.lng}`);
          const data = await res.json();
          if (data.address) {
            setUserAddress(data.address);
          }
        } catch (e) {
          console.warn('Reverse geocode failed:', e);
          setUserAddress(`Coordinates: ${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`);
        }
      },
      (err) => {
        console.warn('Geolocation denied or failed:', err);
        setLocationStatus('denied');
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('Location permission was denied. You can search by area/city name or drop a pin on the map below.');
        } else {
          setLocationError('Could not retrieve GPS location. Please choose an area or drop a pin.');
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Search Address / Area via Server Geocode API
  const handleSearchManualAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualSearchQuery.trim()) return;

    setIsSearchingAddress(true);
    setLocationError(null);

    try {
      const res = await fetch(`/api/maps/geocode/search?q=${encodeURIComponent(manualSearchQuery.trim())}`);
      const data = await res.json();

      if (data.lat && data.lng) {
        setUserLocation({ lat: data.lat, lng: data.lng });
        setUserAddress(data.formattedAddress || manualSearchQuery.trim());
        setLocationStatus('manual');
        setManualSearchQuery('');
      } else {
        setLocationError(`Could not find location for "${manualSearchQuery}". Please try another area or drop a pin.`);
      }
    } catch (err: any) {
      console.warn('Geocoding search failed:', err);
      setLocationError('Location search failed. Please pick a preset area or drop a pin on the map.');
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Select Preset NCR Area Chip
  const handleSelectPresetArea = (area: { name: string; lat: number; lng: number }) => {
    setUserLocation({ lat: area.lat, lng: area.lng });
    setUserAddress(area.name);
    setLocationStatus('manual');
    setLocationError(null);
  };

  // Handle Interactive Map Pin Drop
  const handlePinDropped = async (coords: { lat: number; lng: number }) => {
    setUserLocation(coords);
    setLocationStatus('manual');
    setIsDroppingPinOnMap(false);

    try {
      const res = await fetch(`/api/maps/geocode?lat=${coords.lat}&lng=${coords.lng}`);
      const data = await res.json();
      setUserAddress(data.address || `Pinned Location: ${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`);
    } catch {
      setUserAddress(`Pinned Location: ${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`);
    }
  };

  // Fetch Real Driving Distances from Server when userLocation changes
  useEffect(() => {
    if (!userLocation) return;

    const fetchRealDistances = async () => {
      setIsCalculatingDistances(true);
      try {
        const destinations = appState.hospitals.map((h) => ({
          id: h.id,
          lat: h.lat,
          lng: h.lng,
        }));

        const res = await fetch('/api/maps/distances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: userLocation, destinations }),
        });

        if (res.ok) {
          const data = await res.json();
          const distMap: Record<
            string,
            { distanceKm: number; durationMins: number; distanceText: string; durationText: string; isRealRoute: boolean }
          > = {};
          if (Array.isArray(data.results)) {
            data.results.forEach((r: any) => {
              distMap[r.id] = r;
            });
          }
          setHospitalDistances(distMap);
          if (data.isFallback && data.notice) {
            setDistanceProviderNotice(data.notice);
          } else {
            setDistanceProviderNotice(null);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch real distances from server, fallback active:', err);
      } finally {
        setIsCalculatingDistances(false);
      }
    };

    fetchRealDistances();
  }, [userLocation, appState.hospitals]);

  // Haversine straight-line distance fallback helper
  const calculateHaversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  // -------------------------------------------------------------
  // RANKING & FILTERING HOSPITALS
  // -------------------------------------------------------------
  const rankedHospitals = useMemo(() => {
    return appState.hospitals
      .map((hosp) => {
        // Compute distance: prefer real driving distance from Google Distance Matrix proxy; fallback to straight-line
        let distKm = 4.2;
        let durationMins = 14;
        let isRealRoute = false;

        if (userLocation) {
          const serverDist = hospitalDistances[hosp.id];
          if (serverDist) {
            distKm = serverDist.distanceKm;
            durationMins = serverDist.durationMins;
            isRealRoute = serverDist.isRealRoute;
          } else {
            distKm = calculateHaversineKm(userLocation.lat, userLocation.lng, hosp.lat, hosp.lng);
            durationMins = Math.round(distKm * 2.3 + 4);
          }
        }

        // Check if hospital or its doctors offer matched specialty
        const hasSpecialty = hosp.specialties.some(
          (s) => s.toLowerCase().includes(matchedSpecialty.toLowerCase()) || matchedSpecialty.toLowerCase().includes(s.toLowerCase())
        );

        const doctorsInHosp = appState.doctors.filter((d) => d.hospitalId === hosp.id);
        const doctorsInSpecialty = doctorsInHosp.filter(
          (d) =>
            d.specialization.toLowerCase().includes(matchedSpecialty.toLowerCase()) ||
            matchedSpecialty.toLowerCase().includes(d.specialization.toLowerCase())
        );
        const docsAvailableToday = doctorsInHosp.filter(
          (d) => d.status === 'available' || d.status === 'in_consultation'
        ).length;

        // Reason formulation strictly required: ("Cardiology available, 4.5 stars, 3.4 km")
        const reason = `${matchedSpecialty} available, ${hosp.rating} stars, ${distKm.toFixed(1)} km`;

        // Ranking Score: relevant specialty (+50 pts) + rating * 10 - distance * 1.5 + available docs
        const rankingScore = (hasSpecialty ? 50 : 0) + hosp.rating * 10 - distKm * 1.5 + docsAvailableToday * 2;

        return {
          ...hosp,
          distanceKm: distKm,
          durationMins,
          isRealRoute,
          hasSpecialty,
          doctorsCount: doctorsInHosp.length,
          specialtyDoctorsCount: doctorsInSpecialty.length,
          docsAvailableToday,
          reason,
          rankingScore,
        };
      })
      .filter((h) => {
        // Distance radius filter (30 to 40 km configurable)
        if (userLocation && h.distanceKm > radiusKm) return false;
        // Rating filter
        if (minRatingFilter > 0 && h.rating < minRatingFilter) return false;
        // Doctor available today filter
        if (filterDocAvailableToday && h.docsAvailableToday === 0) return false;
        // Name/address search
        if (hospitalSearchTerm.trim()) {
          const term = hospitalSearchTerm.toLowerCase();
          const matchName = h.name.toLowerCase().includes(term);
          const matchAddr = h.address.toLowerCase().includes(term);
          const matchSpec = h.specialties.some((s) => s.toLowerCase().includes(term));
          if (!matchName && !matchAddr && !matchSpec) return false;
        }
        return true;
      })
      .sort((a, b) => b.rankingScore - a.rankingScore);
  }, [
    appState.hospitals,
    appState.doctors,
    matchedSpecialty,
    userLocation,
    hospitalDistances,
    radiusKm,
    minRatingFilter,
    filterDocAvailableToday,
    hospitalSearchTerm,
  ]);

  // Selected Hospital Record
  const selectedHospital = appState.hospitals.find((h) => h.id === selectedHospitalId) || null;

  // Open "View Hospital Details" Panel (with 3 tabs)
  const openHospitalDetails = async (hosp: Hospital) => {
    setDetailedHospital(hosp);
    setDetailActiveTab('reviews');
    setPlacesReviewsData(null);
    setIsLoadingReviews(true);

    try {
      const res = await fetch(
        `/api/maps/places/reviews?name=${encodeURIComponent(hosp.name)}&lat=${hosp.lat}&lng=${hosp.lng}`
      );
      if (res.ok) {
        const data = await res.json();
        setPlacesReviewsData(data);
      } else {
        setPlacesReviewsData({
          rating: null,
          userRatingsTotal: null,
          reviews: [],
          isFallback: true,
          message: 'Google Places reviews and live ratings are currently unavailable because Google Maps billing or API key is not enabled.',
        });
      }
    } catch (err) {
      console.warn('Failed to load places reviews:', err);
      setPlacesReviewsData({
        rating: null,
        userRatingsTotal: null,
        reviews: [],
        isFallback: true,
        message: 'Google Places reviews and live ratings are currently unavailable because Google Maps billing or API key is not enabled.',
      });
    } finally {
      setIsLoadingReviews(false);
    }
  };

  // Next / Back Navigation
  const handleNextFromStep1 = async () => {
    const combinedText = `${problemSummary} ${voiceTranscript}`.trim();
    const hasMedia = capturedPhotos.length > 0 || attachedFiles.length > 0;

    if (!combinedText && !hasMedia) {
      setValidationError('Please describe your symptoms, speak your problem, or attach a photo before continuing.');
      return;
    }

    if (!hasMatchedOnce) {
      await runSpecialtyMatching();
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!selectedHospitalId) {
      alert('Please select a registered hospital to continue with doctor selection.');
      return;
    }
    setCurrentStep(3);
  };

  // -------------------------------------------------------------
  // STEP 3 & 4 COMPUTED DATA & HANDLERS
  // -------------------------------------------------------------
  // Doctors available at selected hospital
  const hospitalDoctors = useMemo(() => {
    return appState.doctors.filter((d) => d.hospitalId === selectedHospitalId);
  }, [appState.doctors, selectedHospitalId]);

  // Doctors matching AI suggested specialty
  const specialtyMatchedDoctors = useMemo(() => {
    return hospitalDoctors.filter(
      (d) =>
        d.specialization.toLowerCase().includes(matchedSpecialty.toLowerCase()) ||
        matchedSpecialty.toLowerCase().includes(d.specialization.toLowerCase())
    );
  }, [hospitalDoctors, matchedSpecialty]);

  const displayedDoctors = useMemo(() => {
    if (showAllDoctorsAtHospital || specialtyMatchedDoctors.length === 0) {
      return hospitalDoctors;
    }
    return specialtyMatchedDoctors;
  }, [hospitalDoctors, specialtyMatchedDoctors, showAllDoctorsAtHospital]);

  // Selected doctor object
  const selectedDoctor = useMemo(() => {
    return appState.doctors.find((d) => d.id === selectedDoctorId) || displayedDoctors[0] || null;
  }, [appState.doctors, selectedDoctorId, displayedDoctors]);

  // Auto-pick first matching doctor when reaching Step 3
  useEffect(() => {
    if (currentStep === 3 && displayedDoctors.length > 0) {
      if (!selectedDoctorId || !displayedDoctors.some((d) => d.id === selectedDoctorId)) {
        setSelectedDoctorId(displayedDoctors[0].id);
      }
    }
  }, [currentStep, displayedDoctors, selectedDoctorId]);

  // Fetch slots whenever doctor, date, or step changes
  const fetchDoctorSlots = async (docId: string, dateStr: string, currentHold?: string | null) => {
    if (!docId || !dateStr) return;
    setIsLoadingSlots(true);
    setLeaveOrHolidayNotice(null);

    try {
      const res = await fetch(
        `/api/appointments/slots?doctorId=${docId}&date=${dateStr}&holdToken=${currentHold || ''}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.isLeaveOrHoliday) {
          setLeaveOrHolidayNotice(data.reason || 'Doctor is on scheduled leave / holiday on this date.');
          setSlotsList([]);
        } else {
          setSlotsList(data.slots || []);
        }
        if (data.doctorFee) {
          setServerDoctorFee(data.doctorFee);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch doctor slots:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (currentStep === 3 && selectedDoctor?.id && selectedDate) {
      fetchDoctorSlots(selectedDoctor.id, selectedDate, holdToken);
    }
  }, [currentStep, selectedDoctor?.id, selectedDate]);

  // Select Doctor
  const handleSelectDoctor = (docId: string) => {
    if (docId === selectedDoctorId) return;
    setSelectedDoctorId(docId);
    // Release existing hold if changing doctor
    if (holdToken) {
      fetch('/api/appointments/release-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdToken }),
      }).catch(() => {});
      setHoldToken(null);
      setHoldExpiresAt(null);
      setSelectedTimeSlot(null);
    }
    fetchDoctorSlots(docId, selectedDate, null);
  };

  // Select Date
  const handleSelectDate = (newDate: string) => {
    if (newDate < '2026-10-30') return; // Disallow past dates
    setSelectedDate(newDate);
    // Release existing hold if changing date
    if (holdToken) {
      fetch('/api/appointments/release-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdToken }),
      }).catch(() => {});
      setHoldToken(null);
      setHoldExpiresAt(null);
      setSelectedTimeSlot(null);
    }
    if (selectedDoctor?.id) {
      fetchDoctorSlots(selectedDoctor.id, newDate, null);
    }
  };

  // 10-Minute Hold Reservation Transaction
  const handleHoldSlot = async (time: string) => {
    if (!selectedDoctor?.id || !selectedDate) return;
    setIsHoldingSlot(true);
    setHoldError(null);

    try {
      const res = await fetch('/api/appointments/hold-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          date: selectedDate,
          timeSlot: time,
          patientId: verifiedPatientId || activePatient.id || 'guest',
          previousHoldToken: holdToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setHoldError(data.error || 'This time slot is unavailable. Please select another slot.');
        await fetchDoctorSlots(selectedDoctor.id, selectedDate, holdToken);
        return;
      }

      setSelectedTimeSlot(time);
      setHoldToken(data.holdToken);
      setHoldExpiresAt(data.heldUntil);
      setHoldSecondsRemaining(600);
      if (data.doctorFee) setServerDoctorFee(data.doctorFee);

      // Local update to mark slot held by you
      setSlotsList((prev) =>
        prev.map((s) => (s.time === time ? { ...s, status: 'held_by_you', isAvailable: true } : s))
      );
    } catch (err: any) {
      setHoldError('Network error while reserving slot. Please try again.');
    } finally {
      setIsHoldingSlot(false);
    }
  };

  // Proceed from Step 3 to Step 4
  const handleNextFromStep3 = () => {
    if (!selectedDoctor?.id || !selectedDate || !selectedTimeSlot || !holdToken) {
      setHoldError('Please select an available doctor, date, and time slot to continue.');
      return;
    }
    setCurrentStep(4);
  };

  // Step 4: Login Existing Patient
  const handleLoginExistingPatient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    if (!loginIdentifier.trim()) {
      setLoginError('Please enter your registered Email Address or Patient ID.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError(
        'Security notice: You must enter your password. Patient IDs typed alone without authentication cannot be accepted.'
      );
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await authService.loginWithPassword(loginIdentifier, loginPassword, 'patient');
      if (!res.success) {
        setLoginError(res.error || 'Invalid credentials. Patient ID or password does not match.');
        return;
      }

      const loggedIn = authService.getCurrentUser();
      if (loggedIn) {
        setVerifiedPatientId(loggedIn.customId);
        setPatientFullName(loggedIn.name);
        setPatientEmail(loggedIn.email);
        setPatientPhone(loggedIn.phone || '');
        setIsVerifiedPatient(true);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Step 4: Send OTP for New Patient Registration
  const handleSendOtpForRegistration = () => {
    setRegError(null);
    if (!regName.trim()) {
      setRegError('Please enter your full legal name.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setRegError('Please enter a valid email address.');
      return;
    }
    if (!regPhone.trim() || regPhone.replace(/\D/g, '').length < 10) {
      setRegError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!regPassword || regPassword.length < 8) {
      setRegError('Password must be at least 8 characters long with letters and numbers.');
      return;
    }

    // Check duplicate account
    const dupCheck = authService.checkDuplicateAccount(regEmail, regPhone);
    if (dupCheck.isDuplicate) {
      setRegError(dupCheck.error || 'An account with this email or phone already exists.');
      return;
    }

    // Generate simulated 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setSimulatedOtpCode(otp);
    setIsOtpSent(true);
    setEmailVerified(true);
    setRegSuccessMessage(
      `Verification OTP sent to +91 ${regPhone.slice(-10)} and confirmation code sent to ${regEmail}. Test OTP: ${otp}`
    );
  };

  // Step 4: Complete Inline Registration
  const handleCompleteRegistration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setRegError(null);

    if (!isOtpSent) {
      handleSendOtpForRegistration();
      return;
    }

    if (enteredOtpCode.trim() !== simulatedOtpCode) {
      setRegError('Invalid verification OTP code. Please enter the 6-digit code shown in the verification prompt.');
      return;
    }

    setIsRegistering(true);
    try {
      const regRes = await authService.registerWithPassword({
        name: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword,
        role: 'patient',
        portal: 'patient',
        dob: regDob,
        gender: regGender,
        bloodGroup: regBloodGroup as any,
        allergies: regAllergies
          ? regAllergies
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        emergencyContactName: regEmergencyContactName.trim(),
        emergencyContactPhone: regEmergencyContactPhone.trim(),
      });

      if (!regRes.success || !regRes.customId) {
        setRegError(regRes.error || 'Failed to complete registration.');
        return;
      }

      setVerifiedPatientId(regRes.customId);
      setPatientFullName(regName.trim());
      setPatientEmail(regEmail.trim());
      setPatientPhone(regPhone.trim());
      setPatientDob(regDob);
      setPatientGender(regGender);
      setPatientBloodGroup(regBloodGroup);
      setPatientAllergies(regAllergies);
      setPatientEmergencyContactName(regEmergencyContactName);
      setPatientEmergencyContactPhone(regEmergencyContactPhone);
      setIsVerifiedPatient(true);
      setRegSuccessMessage(`Registration verified! Your unique Patient ID is ${regRes.customId}.`);
    } catch (err: any) {
      setRegError(err.message || 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Step 4: Confirm & Create Appointment Record
  const handleCreateAppointmentRecord = async () => {
    setCreateAppointmentError(null);

    if (!isVerifiedPatient || !verifiedPatientId) {
      setCreateAppointmentError(
        'You must authenticate as an existing patient or complete verified registration before booking.'
      );
      return;
    }

    if (!selectedDoctor?.id || !selectedHospitalId || !selectedDate || !selectedTimeSlot) {
      setCreateAppointmentError('Missing doctor, hospital, date, or time slot selection.');
      return;
    }

    setIsCreatingAppointment(true);
    try {
      const res = await fetch('/api/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdToken,
          patientId: verifiedPatientId,
          uniquePatientId: verifiedPatientId,
          patientName: patientFullName,
          patientEmail,
          patientPhone,
          doctorId: selectedDoctor.id,
          hospitalId: selectedHospitalId,
          department: selectedDoctor.specialization,
          date: selectedDate,
          timeSlot: selectedTimeSlot,
          problemSummary,
          voiceTranscript,
          caseSummary: structuredCase.formattedText,
          aiSpecialtySuggestion: matchedSpecialty,
          attachedPhotos: [...capturedPhotos, ...attachedFiles.map((f) => f.name)],
          urgencyLevel,
          isEmergency: isEmergencyDetected,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateAppointmentError(data.error || 'Failed to create appointment record on server.');
        return;
      }

      // Sync record in appStore
      const syncRecord = appStore.createAppointmentRecord({
        patientId: verifiedPatientId,
        patientName: patientFullName,
        uniquePatientId: verifiedPatientId,
        patientEmail,
        patientPhone,
        doctorId: selectedDoctor.id,
        hospitalId: selectedHospitalId,
        department: selectedDoctor.specialization,
        date: selectedDate,
        timeSlot: selectedTimeSlot,
        fee: data.appointment?.fee || serverDoctorFee,
        problemSummary,
        voiceTranscript,
        caseSummary: structuredCase.formattedText,
        aiSpecialtySuggestion: matchedSpecialty,
        urgencyLevel,
        isEmergency: isEmergencyDetected,
        attachedPhotos: [...capturedPhotos, ...attachedFiles.map((f) => f.name)],
      });

      setCreatedAppointment(syncRecord);
      setCurrentStep(5);
    } catch (err: any) {
      setCreateAppointmentError('Network error while creating appointment record.');
    } finally {
      setIsCreatingAppointment(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else if (onNavigateToAppointments) {
      onNavigateToAppointments();
    }
  };

  const handleNextPlaceholder = () => {
    if (currentStep < 6) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const structuredCase = buildStructuredCaseSummary();

  // Map markers for GoogleMapsView in Step 2 / Details
  const hospitalMapMarkers: MarkerItem[] = useMemo(() => {
    const markers: MarkerItem[] = [];

    // User location marker
    if (userLocation) {
      markers.push({
        id: 'user-pin',
        lat: userLocation.lat,
        lng: userLocation.lng,
        title: 'Your Location',
        subtitle: userAddress || 'Selected Patient Location',
        type: 'user',
      });
    }

    // Registered hospital markers
    appState.hospitals.forEach((h) => {
      markers.push({
        id: h.id,
        lat: h.lat,
        lng: h.lng,
        title: h.name,
        subtitle: `${h.rating} ★ • ${h.specialties.slice(0, 2).join(', ')}`,
        type: 'hospital',
      });
    });

    return markers;
  }, [userLocation, userAddress, appState.hospitals]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* ------------------------------------------------------------- */}
      {/* CONTINUOUS WIZARD STEP PROGRESS BAR                           */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-[#E3E8EB] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E3E8EB]">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-[#0E7C7B] text-[11px] font-bold uppercase tracking-wider">
                Step {currentStep} of 6
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                {currentStep === 1 && 'Describe Your Health Problem & Specialty Match'}
                {currentStep === 2 && `Find Hospitals for ${matchedSpecialty}`}
                {currentStep === 3 && 'Doctor and Time Selection'}
                {currentStep === 4 && 'Your Details'}
                {currentStep === 5 && 'Payment'}
                {currentStep === 6 && 'Confirmation'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              One continuous verified appointment booking flow with real-distance hospital discovery & clinical triage.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {onNavigateToAppointments && (
              <button
                type="button"
                onClick={onNavigateToAppointments}
                className="text-slate-500 hover:text-slate-800 font-medium px-2.5 py-1 rounded-md hover:bg-slate-100 transition-colors"
              >
                Back to Appointments
              </button>
            )}
          </div>
        </div>

        {/* The 6 Steps Progress Bar */}
        <div className="grid grid-cols-6 gap-1 sm:gap-2 pt-3">
          {[
            { num: 1, label: 'Problem' },
            { num: 2, label: 'Hospital' },
            { num: 3, label: 'Doctor & Time' },
            { num: 4, label: 'Your Details' },
            { num: 5, label: 'Payment' },
            { num: 6, label: 'Confirmation' },
          ].map((s) => {
            const isCompleted = currentStep > s.num;
            const isCurrent = currentStep === s.num;

            return (
              <div key={s.num} className="flex flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (s.num <= currentStep) {
                      setCurrentStep(s.num);
                    }
                  }}
                  disabled={s.num > currentStep}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700'
                      : isCurrent
                      ? 'bg-[#0E7C7B] text-white ring-4 ring-teal-100'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                </button>
                <span
                  className={`text-[10px] sm:text-[11px] font-medium mt-1 truncate max-w-[85px] ${
                    isCurrent ? 'text-[#0E7C7B] font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RED EMERGENCY ALERT BANNER (If symptoms suggest emergency)    */}
      {/* ------------------------------------------------------------- */}
      {isEmergencyDetected && (
        <div className="p-4 sm:p-5 rounded-xl bg-red-600 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-white shrink-0 mt-0.5 animate-bounce" />
            <div>
              <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>This may be an emergency. Use SOS or call 108</span>
              </div>
              <p className="text-xs text-red-100 mt-1 leading-relaxed">
                Symptoms such as chest pain, difficulty breathing, severe bleeding, unconsciousness, or stroke signs require urgent medical care.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenSOS && (
              <button
                type="button"
                onClick={onOpenSOS}
                className="px-4 py-2 rounded-lg bg-white text-red-700 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-transform active:scale-95"
              >
                <ShieldAlert className="w-4 h-4 text-red-700" />
                <span>Open One-Tap SOS</span>
              </button>
            )}
            <a
              href="tel:108"
              className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold border border-red-400 transition-colors"
            >
              Call 108
            </a>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 1: DESCRIBE HEALTH PROBLEM & SPECIALTY MATCH (Part 1)    */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#E3E8EB] p-5 sm:p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Step 1: Describe your health problem</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Provide your symptoms via text, voice, or photos. Our clinical AI will evaluate your case and suggest the most appropriate medical specialty.
              </p>
            </div>

            {/* Validation Error Banner */}
            {validationError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Brief problem summary with character limit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Brief Problem Summary <span className="text-red-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    problemSummary.length >= MAX_PROBLEM_CHARS
                      ? 'text-red-600 font-bold'
                      : problemSummary.length >= MAX_PROBLEM_CHARS - 50
                      ? 'text-amber-600'
                      : 'text-slate-400'
                  }`}
                >
                  {problemSummary.length} / {MAX_PROBLEM_CHARS} chars
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={MAX_PROBLEM_CHARS}
                value={problemSummary}
                onChange={(e) => {
                  setProblemSummary(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="e.g., Persistent lower back pain radiating down my left leg for the last 3 days, worsens when sitting..."
                className="w-full text-xs rounded-lg border border-[#E3E8EB] p-3 focus:outline-none focus:border-[#0E7C7B] focus:ring-1 focus:ring-[#0E7C7B] transition-all bg-white"
              />
            </div>

            {/* Voice Recording (Web Speech API) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isRecordingVoice ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-teal-100 text-[#0E7C7B]'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Speak your problem (Web Speech API)</span>
                      {micPermissionStatus === 'granted' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Mic Allowed</span>
                        </span>
                      ) : micPermissionStatus === 'denied' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowPermissionModal(true);
                            setPermissionModalFocus('mic');
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 cursor-pointer"
                        >
                          <Lock className="w-2.5 h-2.5 text-red-600" />
                          <span>Mic Blocked (Allow)</span>
                        </button>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Convert voice into text in real time. You can edit the transcript below.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPermissionModal(true);
                      setPermissionModalFocus('both');
                    }}
                    className="text-[11px] text-[#0E7C7B] hover:text-[#0a5c5b] font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-teal-50 cursor-pointer"
                    title="Manage Microphone and Camera browser permissions"
                  >
                    <Settings className="w-3 h-3 text-[#0E7C7B]" />
                    <span>Permissions</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium">Language:</span>
                    <select
                      value={speechLanguage}
                      onChange={(e) => setSpeechLanguage(e.target.value as any)}
                      className="text-xs rounded-md border border-[#E3E8EB] bg-white px-2.5 py-1 text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
                    >
                      <option value="en-IN">English (India)</option>
                      <option value="hi-IN">हिन्दी (Hindi)</option>
                      <option value="pa-IN">ਪੰਜਾਬੀ (Punjabi)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Enhanced Actionable Permission Notice Banner when Speech Error Occurs */}
              {speechError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-2.5 shadow-xs animate-in fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600 mt-0.5">
                        <MicOff className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-red-900 text-xs">Microphone Permission Notification</div>
                        <div className="text-[11px] text-red-700 mt-0.5 leading-relaxed font-medium">
                          {speechError}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSpeechError(null)}
                      className="text-red-400 hover:text-red-700 p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPermissionModal(true);
                        setPermissionModalFocus('mic');
                        handleGrantPermissions('mic');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-transform active:scale-95"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Allow Microphone Access</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPermissionModal(true);
                        setPermissionModalFocus('mic');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-red-600" />
                      <span>How to Unblock in Browser</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSimulateVoiceInput(
                          'Severe chest discomfort radiating to left shoulder with shortness of breath for the past 2 days.'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      <span>Use Sample Voice Note</span>
                    </button>
                  </div>
                </div>
              )}

              {!speechSupported && (
                <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  Web Speech API is not supported in this browser. Please type your problem description in the box above.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSpeechRecording}
                  disabled={!speechSupported}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    isRecordingVoice
                      ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md'
                      : 'bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white shadow-xs'
                  } disabled:bg-slate-300 disabled:cursor-not-allowed`}
                >
                  {isRecordingVoice ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      <span>Listening... Tap to Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Speak Your Problem</span>
                    </>
                  )}
                </button>

                {voiceTranscript && (
                  <button
                    type="button"
                    onClick={() => setVoiceTranscript('')}
                    className="text-xs text-slate-500 hover:text-red-600 underline cursor-pointer"
                  >
                    Clear transcript
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowPermissionModal(true);
                    setPermissionModalFocus('mic');
                  }}
                  className="text-xs text-slate-500 hover:text-[#0E7C7B] flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <Lock className="w-3 h-3" />
                  <span>Permission settings</span>
                </button>
              </div>

              {voiceTranscript && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>Spoken Transcript (Editable):</span>
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-medium">
                      ✓ Converted from Speech
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder="Transcript will appear here. You can edit or add notes..."
                    className="w-full text-xs rounded-lg border border-[#E3E8EB] bg-white p-2.5 focus:outline-none focus:border-[#0E7C7B]"
                  />
                </div>
              )}
            </div>

            {/* Camera Capture & File Upload */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[#E3E8EB] space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#0E7C7B]" />
                    <span className="text-xs font-bold text-slate-800">Capture with Camera</span>
                    {cameraPermissionStatus === 'granted' ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-2.5 h-2.5" />
                        <span>Allowed</span>
                      </span>
                    ) : cameraPermissionStatus === 'denied' ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Blocked</span>
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                    Optional
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Take a photo of a rash, swelling, or visible injury with your phone or laptop camera.
                </p>

                {cameraError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-2">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-start gap-1.5 text-red-800">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                        <span className="text-[11px] leading-relaxed font-medium">{cameraError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCameraError(null)}
                        className="text-red-400 hover:text-red-700 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-red-200/60">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPermissionModal(true);
                          setPermissionModalFocus('camera');
                          handleGrantPermissions('camera');
                        }}
                        className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Grant Camera Access</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPermissionModal(true);
                          setPermissionModalFocus('camera');
                        }}
                        className="px-2.5 py-1 rounded-md border border-red-300 bg-white hover:bg-red-50 text-red-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>Unblock Guide</span>
                      </button>
                    </div>
                  </div>
                )}

                {isCameraActive ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={captureCameraPhoto}
                        className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Snap Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeCamera}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openCamera}
                    className="w-full py-2.5 rounded-lg border border-dashed border-[#0E7C7B] text-[#0E7C7B] bg-teal-50/50 hover:bg-teal-50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Open Device Camera</span>
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl border border-[#E3E8EB] space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-[#0E7C7B]" />
                    <span className="text-xs font-bold text-slate-800">Upload Injury or Report</span>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                    Max 5MB
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Attach an image or PDF of lab test reports, prescriptions, or injury photos.
                </p>

                {uploadError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[11px]">{uploadError}</span>
                  </div>
                )}

                <label className="w-full py-2.5 rounded-lg border border-dashed border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Choose Image or PDF File</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Media previews */}
            {(capturedPhotos.length > 0 || attachedFiles.length > 0) && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Attached Media & Files ({capturedPhotos.length + attachedFiles.length})
                  </span>
                  <span className="text-[11px] text-slate-500">Click &times; to remove</span>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  {capturedPhotos.map((photo, idx) => (
                    <div key={`cam-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 group">
                      <img src={photo} alt={`Camera capture ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setCapturedPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-600 cursor-pointer transition-colors"
                        title="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {attachedFiles.map((file, idx) => (
                    <div
                      key={`file-${idx}`}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-2xs"
                    >
                      <div className="w-7 h-7 rounded bg-teal-50 text-[#0E7C7B] flex items-center justify-center font-bold text-[10px] shrink-0 uppercase">
                        {file.type}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate max-w-[130px]">{file.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{file.size}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                        title="Remove file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Privacy Note & Consent Checkbox */}
            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-[#0E7C7B] shrink-0 mt-0.5" />
                <p className="text-slate-700 leading-relaxed">
                  <strong>Privacy Note:</strong> Your description and photos are used only to suggest a specialty and are shared with the hospital you choose.
                </p>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer font-medium text-slate-800 pt-1">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="rounded border-slate-300 text-[#0E7C7B] focus:ring-[#0E7C7B] w-4 h-4"
                />
                <span className="text-xs">
                  I consent to sharing my description and photos for clinical specialty suggestion and with my selected hospital.
                </span>
              </label>
            </div>

            {/* Patient Profile Context Preview */}
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="font-bold text-slate-800 flex items-center justify-between">
                <span>Patient Profile Included in Case Summary:</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  ID: {activePatient.uniquePatientId || 'Guest / New'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Age / Gender:</span>
                  <span className="font-semibold text-slate-800">
                    {activePatient.age || 'Not specified'} yrs • {activePatient.gender || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Blood Group:</span>
                  <span className="font-semibold text-slate-800">{activePatient.bloodGroup || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Known Allergies:</span>
                  <span className="font-semibold text-slate-800">
                    {activePatient.allergies && activePatient.allergies.length > 0
                      ? activePatient.allergies.join(', ')
                      : 'None reported'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Chronic Conditions:</span>
                  <span className="font-semibold text-slate-800">
                    {activePatient.chronicConditions && activePatient.chronicConditions.length > 0
                      ? activePatient.chronicConditions.join(', ')
                      : 'None reported'}
                  </span>
                </div>
              </div>
            </div>

            {/* Button to Trigger AI Specialty Matching */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#E3E8EB]">
              <span className="text-xs text-slate-500">
                {hasMatchedOnce ? 'Specialty matched. Review recommendation below or modify.' : 'Ready? Analyze symptoms with MediTrack AI.'}
              </span>

              <button
                type="button"
                onClick={runSpecialtyMatching}
                disabled={isMatchingSpecialty}
                className="px-5 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                {isMatchingSpecialty ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing with Gemini AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{hasMatchedOnce ? 'Re-analyze with AI' : 'Analyze & Match Specialty'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Specialty Recommendation Card */}
          {isMatchingSpecialty && (
            <div className="bg-white rounded-xl border border-[#E3E8EB] p-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#0E7C7B] animate-spin mx-auto" />
              <div className="text-sm font-bold text-slate-900">Matching with Medical Specialties...</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Gemini AI is evaluating your combined case summary against outpatient department clinical guidelines.
              </p>
            </div>
          )}

          {!isMatchingSpecialty && hasMatchedOnce && (
            <div className="bg-white rounded-xl border border-[#E3E8EB] p-5 sm:p-6 space-y-5 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E3E8EB]">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">AI Specialty Recommendation</h3>
                  <p className="text-xs text-slate-500">
                    Clinical specialty suggestion based on your reported symptoms and health profile.
                  </p>
                </div>
                {matchSource === 'keywords' ? (
                  <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Suggested by keywords
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Gemini AI Analysis
                  </span>
                )}
              </div>

              {aiCallFailed && aiErrorMessage && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Notice:</span> {aiErrorMessage}
                  </div>
                </div>
              )}

              <div className="p-5 rounded-xl bg-gradient-to-br from-teal-50/80 to-emerald-50/40 border border-teal-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#0E7C7B]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-900">
                      {matchSource === 'keywords' ? 'Suggested by keywords' : 'Suggested Specialty'}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      urgencyLevel === 'Urgent'
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : urgencyLevel === 'Soon'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    Urgency: {urgencyLevel}
                  </span>
                </div>

                <div className="text-2xl font-black text-slate-900 tracking-tight">{matchedSpecialty}</div>

                {aiMatchReason && (
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    &quot;{aiMatchReason}&quot;
                  </p>
                )}

                {suggestedAlternatives.length > 0 && (
                  <div className="pt-2 border-t border-teal-200/60 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-600 text-[11px] font-medium">Alternative Options:</span>
                    {suggestedAlternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => setMatchedSpecialty(alt)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-all ${
                          matchedSpecialty === alt
                            ? 'bg-[#0E7C7B] text-white'
                            : 'bg-white border border-teal-200 text-[#0E7C7B] hover:bg-teal-50'
                        }`}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Patient Dropdown Override */}
              <div className="p-4 rounded-xl border border-[#E3E8EB] bg-slate-50/60 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Want to choose a different specialty? Select from the dropdown:
                </label>
                <select
                  value={matchedSpecialty}
                  onChange={(e) => setMatchedSpecialty(e.target.value as AllowedSpecialty)}
                  className="w-full text-xs font-semibold rounded-lg border border-[#E3E8EB] bg-white p-2.5 text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
                >
                  {ALLOWED_SPECIALTIES.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mandatory Clinical Disclaimer */}
              <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>AI suggestion, not a diagnosis. A doctor will assess you.</strong> MediTrack AI provides specialty triage based solely on self-reported symptoms to help direct you to the appropriate clinic. No disease is diagnosed, and no medication is prescribed.
                </p>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E3E8EB]">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextFromStep1}
                  className="px-6 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
                >
                  <span>Next: Find Hospitals for {matchedSpecialty}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {!hasMatchedOnce && !isMatchingSpecialty && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleNextFromStep1}
                className="px-6 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <span>Next: AI Specialty Match</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 2: FIND & SELECT HOSPITALS (Part 2 of 5)                 */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header & Specialty Badge */}
          <div className="bg-white rounded-xl border border-[#E3E8EB] p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E3E8EB]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-[#0E7C7B] text-[11px] font-bold">
                    Specialty: {matchedSpecialty}
                  </span>
                  <h2 className="text-base font-bold text-slate-900">Recommended Hospitals</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Hospitals ranked by {matchedSpecialty} availability, verified rating, and real road distance from your location.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Specialty / Problem</span>
              </button>
            </div>

            {/* 1. Location Bar: Permission, City Search, Preset Area, Pin Drop (Never Hardcoded) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className={`w-5 h-5 shrink-0 mt-0.5 ${userLocation ? 'text-[#0E7C7B]' : 'text-amber-500'}`} />
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>Your Location (Required for Real Road Distances)</span>
                      {userLocation ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded font-semibold">
                          Active: {locationStatus === 'granted' ? 'GPS Live' : 'Custom Location'}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.2 rounded font-semibold">
                          Location not set
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {userLocation ? (
                        <span>{userAddress || `${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E`}</span>
                      ) : (
                        <span>Please allow browser location, type your area, or drop a pin on the map.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={requestBrowserLocation}
                    disabled={locationStatus === 'locating'}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#E3E8EB] hover:border-[#0E7C7B] text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <Compass className={`w-3.5 h-3.5 text-[#0E7C7B] ${locationStatus === 'locating' ? 'animate-spin' : ''}`} />
                    <span>{locationStatus === 'locating' ? 'Detecting GPS...' : 'Use My Current Location'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDroppingPinOnMap(!isDroppingPinOnMap)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isDroppingPinOnMap
                        ? 'bg-amber-500 text-slate-950 border-amber-600 ring-2 ring-amber-300'
                        : 'bg-white border-[#E3E8EB] hover:border-[#0E7C7B] text-slate-700'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    <span>{isDroppingPinOnMap ? 'Click Map to Set Location' : 'Drop Pin on Map'}</span>
                  </button>
                </div>
              </div>

              {locationError && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-[11px]">{locationError}</span>
                </div>
              )}

              {/* Type City or Area Input */}
              <form onSubmit={handleSearchManualAddress} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={manualSearchQuery}
                    onChange={(e) => setManualSearchQuery(e.target.value)}
                    placeholder="Type your area or landmark (e.g. Connaught Place, Dwarka, Noida, Saket, Karol Bagh)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E3E8EB] bg-white text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearchingAddress || !manualSearchQuery.trim()}
                  className="px-4 py-1.5 bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isSearchingAddress ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  <span>Search Area</span>
                </button>
              </form>

              {/* Quick Area Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-[11px] text-slate-500 font-medium">Quick select:</span>
                {POPULAR_AREAS.map((area) => (
                  <button
                    key={area.name}
                    type="button"
                    onClick={() => handleSelectPresetArea(area)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-[#0E7C7B] cursor-pointer transition-colors"
                  >
                    {area.name.split(' (')[0]}
                  </button>
                ))}
              </div>

              {/* Interactive Location Pin Map if user clicks "Drop Pin on Map" */}
              {isDroppingPinOnMap && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                    <span className="font-semibold">Interactive Pin Mode: Click anywhere on the map to set your location pin.</span>
                    <button
                      type="button"
                      onClick={() => setIsDroppingPinOnMap(false)}
                      className="font-bold underline text-amber-900 hover:text-black"
                    >
                      Done
                    </button>
                  </div>
                  <div className="h-56 rounded-lg overflow-hidden border border-slate-300">
                    <GoogleMapsView
                      center={userLocation || { lat: 28.6315, lng: 77.2167 }}
                      zoom={12}
                      className="w-full h-full"
                      isDroppingPin={true}
                      onPinDropped={handlePinDropped}
                      droppedPin={userLocation}
                      markers={hospitalMapMarkers}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. Filters Bar (Radius, Min Rating, Doctor Available Today, Search) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-[#E3E8EB] text-xs">
              <div className="flex flex-wrap items-center gap-4">
                {/* Distance Radius (Configurable 30 to 40 km standard) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Radius:</span>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="rounded-md border border-[#E3E8EB] bg-white px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
                  >
                    <option value={15}>15 km</option>
                    <option value={25}>25 km</option>
                    <option value={30}>30 km</option>
                    <option value={35}>35 km (Standard)</option>
                    <option value={40}>40 km</option>
                    <option value={50}>50 km (Wide)</option>
                  </select>
                </div>

                {/* Min Rating */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Min Rating:</span>
                  <select
                    value={minRatingFilter}
                    onChange={(e) => setMinRatingFilter(Number(e.target.value))}
                    className="rounded-md border border-[#E3E8EB] bg-white px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
                  >
                    <option value={0}>All Ratings</option>
                    <option value={4.0}>4.0+ Stars</option>
                    <option value={4.5}>4.5+ Stars</option>
                    <option value={4.8}>4.8+ Stars</option>
                  </select>
                </div>

                {/* Doctor Available Today Toggle */}
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={filterDocAvailableToday}
                    onChange={(e) => setFilterDocAvailableToday(e.target.checked)}
                    className="rounded border-slate-300 text-[#0E7C7B] focus:ring-[#0E7C7B]"
                  />
                  <span>Doctor available today</span>
                </label>
              </div>

              {/* Keyword Filter */}
              <div className="w-full sm:w-56">
                <input
                  type="text"
                  value={hospitalSearchTerm}
                  onChange={(e) => setHospitalSearchTerm(e.target.value)}
                  placeholder="Filter hospitals by name..."
                  className="w-full px-2.5 py-1 text-xs rounded-md border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                />
              </div>
            </div>

            {/* Provider notice / fallback notice */}
            {distanceProviderNotice && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                <span>{distanceProviderNotice}</span>
                <span className="text-[10px] font-mono text-slate-400">Straight-line fallback</span>
              </div>
            )}

            {isCalculatingDistances && (
              <div className="flex items-center gap-2 text-xs text-[#0E7C7B] font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Computing real road distances via Google Maps Distance Matrix...</span>
              </div>
            )}
          </div>

          {/* 3. & 4. Hospital Cards List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
              <span>
                {rankedHospitals.length} Registered Hospital{rankedHospitals.length === 1 ? '' : 's'} Found
              </span>
              <span>Sorted by clinical relevance, rating & distance</span>
            </div>

            {/* Empty State with suggestion to widen radius */}
            {rankedHospitals.length === 0 && (
              <div className="p-8 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-3">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">No Hospitals Found Within {radiusKm} km</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No registered hospitals match your current filter criteria ({radiusKm} km radius
                  {minRatingFilter > 0 ? `, rating >= ${minRatingFilter}` : ''}
                  {filterDocAvailableToday ? ', doctor available today' : ''}).
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRadiusKm(50);
                      setMinRatingFilter(0);
                      setFilterDocAvailableToday(false);
                      setHospitalSearchTerm('');
                    }}
                    className="px-4 py-2 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    Widen Search Radius to 50 km & Reset Filters
                  </button>
                </div>
              </div>
            )}

            {/* Hospital Cards Grid */}
            <div className="grid grid-cols-1 gap-4">
              {rankedHospitals.map((hosp) => {
                const isSelected = selectedHospitalId === hosp.id;

                return (
                  <div
                    key={hosp.id}
                    className={`bg-white rounded-xl border p-5 transition-all shadow-xs ${
                      isSelected
                        ? 'border-[#0E7C7B] ring-2 ring-teal-100 bg-teal-50/20'
                        : 'border-[#E3E8EB] hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Hospital Details */}
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-700">
                            {hosp.code}
                          </span>
                          <h3 className="text-base font-bold text-slate-900">{hosp.name}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            MediTrack Registered
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{hosp.address}</span>
                        </div>

                        {/* Reason badge */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 border border-teal-200 text-[#0E7C7B] text-xs font-semibold">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>&quot;{hosp.reason}&quot;</span>
                        </div>

                        {/* Specialty Tags */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                          {hosp.specialties.map((spec) => {
                            const isMatch =
                              spec.toLowerCase().includes(matchedSpecialty.toLowerCase()) ||
                              matchedSpecialty.toLowerCase().includes(spec.toLowerCase());
                            return (
                              <span
                                key={spec}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  isMatch
                                    ? 'bg-[#0E7C7B] text-white font-bold shadow-2xs'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {spec}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Distance & Action Column */}
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                        {/* Rating & Distance */}
                        <div className="text-left md:text-right space-y-0.5">
                          <div className="flex items-center md:justify-end gap-1.5">
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span>{hosp.rating}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              ({userLocation ? `${hosp.distanceKm} km` : 'Distance upon GPS'})
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono">
                            {userLocation ? (
                              <span>~{hosp.durationMins} mins {hosp.isRealRoute ? 'driving' : 'est.'}</span>
                            ) : (
                              <span>GPS required</span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openHospitalDetails(hosp)}
                            className="px-3 py-1.5 rounded-lg border border-[#E3E8EB] hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                          >
                            View Details
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedHospitalId(hosp.id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                              isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white'
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Selected</span>
                              </>
                            ) : (
                              <span>Select Hospital</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 6. Nearby Hospitals on Google (Not on MediTrack network) */}
            <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Nearby Facilities on Google Places (Not on MediTrack Network)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    These hospitals are discovered via Google Maps. Online token booking is not available; walk-in or phone call only.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {EXTERNAL_GOOGLE_HOSPITALS.map((ext) => (
                  <div key={ext.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-xs text-slate-800">{ext.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{ext.address}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 shrink-0">
                        Not on MediTrack
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {ext.specialties.map((s) => (
                        <span key={s} className="px-1.5 py-0.2 bg-white border border-slate-200 rounded text-slate-600">
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <a
                        href={`tel:${ext.phone}`}
                        className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1 text-[11px]"
                      >
                        <Phone className="w-3 h-3 text-[#0E7C7B]" />
                        <span>Call {ext.phone}</span>
                      </a>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ext.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1 text-[11px]"
                      >
                        <Navigation className="w-3 h-3 text-[#0E7C7B]" />
                        <span>Directions</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Navigation Buttons for Step 2 */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E3E8EB]">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Step 1 (Problem)</span>
            </button>

            <button
              type="button"
              disabled={!selectedHospitalId}
              onClick={handleNextFromStep2}
              className="px-6 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <span>Next: Doctor and Time</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. "VIEW HOSPITAL DETAILS" MODAL PANEL (3 TABS)               */}
      {/* ------------------------------------------------------------- */}
      {detailedHospital && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E3E8EB] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E3E8EB] flex items-start justify-between gap-3 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-100 text-[#0E7C7B]">
                    {detailedHospital.code}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{detailedHospital.name}</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{detailedHospital.address}</p>
              </div>

              <button
                type="button"
                onClick={() => setDetailedHospital(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Tabs Header: Reviews and ratings, Available doctors, Distance and directions */}
            <div className="flex border-b border-[#E3E8EB] bg-white px-5 pt-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDetailActiveTab('reviews')}
                className={`pb-3 px-3 border-b-2 cursor-pointer transition-colors ${
                  detailActiveTab === 'reviews'
                    ? 'border-[#0E7C7B] text-[#0E7C7B] font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Reviews & Ratings
              </button>
              <button
                type="button"
                onClick={() => setDetailActiveTab('doctors')}
                className={`pb-3 px-3 border-b-2 cursor-pointer transition-colors ${
                  detailActiveTab === 'doctors'
                    ? 'border-[#0E7C7B] text-[#0E7C7B] font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Available Doctors & Expertise
              </button>
              <button
                type="button"
                onClick={() => setDetailActiveTab('directions')}
                className={`pb-3 px-3 border-b-2 cursor-pointer transition-colors ${
                  detailActiveTab === 'directions'
                    ? 'border-[#0E7C7B] text-[#0E7C7B] font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Distance & Directions
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* TAB 1: REVIEWS AND RATINGS */}
              {detailActiveTab === 'reviews' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <span>{detailedHospital.rating}</span>
                        <div className="flex text-amber-400 text-sm">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {placesReviewsData?.userRatingsTotal
                          ? `${placesReviewsData.userRatingsTotal} verified patient reviews on Google`
                          : 'Official MediTrack Verified Facility'}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Top Rated in {matchedSpecialty}
                      </span>
                    </div>
                  </div>

                  {isLoadingReviews ? (
                    <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#0E7C7B]" />
                      <span>Loading verified reviews from Google Places...</span>
                    </div>
                  ) : placesReviewsData?.isFallback ? (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-amber-700" />
                        <span>Google Places Reviews Notice</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {placesReviewsData.message ||
                          'Google Places reviews and live ratings are currently unavailable because Google Maps billing or API key is not enabled.'}
                      </p>
                      <p className="text-[10px] text-amber-800">
                        Hospital clinical accreditation and quality scores are maintained under internal MediTrack Quality Standards (Rating: {detailedHospital.rating} / 5.0).
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>Google Places Verified Reviews</span>
                        <span className="text-[10px] text-slate-400">{placesReviewsData?.attribution || 'Google Places API'}</span>
                      </div>

                      {placesReviewsData?.reviews && placesReviewsData.reviews.length > 0 ? (
                        placesReviewsData.reviews.map((rev, idx) => (
                          <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-1.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{rev.author_name}</span>
                              <div className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span>{rev.rating}</span>
                              </div>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">&quot;{rev.text}&quot;</p>
                            {rev.relative_time_description && (
                              <div className="text-[10px] text-slate-400 font-mono">{rev.relative_time_description}</div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          No public reviews found for this facility.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: AVAILABLE DOCTORS AND EXPERTISE */}
              {detailActiveTab === 'doctors' && (() => {
                const doctors = appState.doctors.filter((d) => d.hospitalId === detailedHospital.id);

                return (
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>Attending Physicians at {detailedHospital.name} ({doctors.length})</span>
                      <span className="text-[11px] text-[#0E7C7B] font-semibold">Matched: {matchedSpecialty}</span>
                    </div>

                    <div className="space-y-2.5">
                      {doctors.map((doc) => {
                        const isMatch =
                          doc.specialization.toLowerCase().includes(matchedSpecialty.toLowerCase()) ||
                          matchedSpecialty.toLowerCase().includes(doc.specialization.toLowerCase());

                        return (
                          <div
                            key={doc.id}
                            className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                              isMatch ? 'bg-teal-50/50 border-teal-200' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                  <span>{doc.name}</span>
                                  {isMatch && (
                                    <span className="text-[10px] bg-[#0E7C7B] text-white px-1.5 py-0.2 rounded font-semibold">
                                      Specialist Match
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#0E7C7B] font-semibold">{doc.specialization}</div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {doc.experienceYears} years experience • {doc.roomNumber || 'OPD Cabin'}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-mono font-bold text-slate-900 block text-sm">
                                  ₹{doc.consultationFee || 650}
                                </span>
                                <span className="text-[10px] text-slate-400">Consultation Fee</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1 text-slate-600">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>Next free slot: Today, 10:30 AM (Available)</span>
                              </span>
                              <span
                                className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                                  doc.status === 'available'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {doc.status === 'available' ? 'Available Today' : 'In Consultation'}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {doctors.length === 0 && (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          No doctors currently listed for this facility in the registry.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* TAB 3: DISTANCE AND DIRECTIONS */}
              {detailActiveTab === 'directions' && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900">Destination: {detailedHospital.name}</div>
                      <div className="text-[11px] text-slate-500">{detailedHospital.address}</div>
                    </div>
                    {userLocation && (
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#0E7C7B] text-sm">
                          {hospitalDistances[detailedHospital.id]?.distanceKm ||
                            calculateHaversineKm(userLocation.lat, userLocation.lng, detailedHospital.lat, detailedHospital.lng)}{' '}
                          km
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          ~
                          {hospitalDistances[detailedHospital.id]?.durationMins || 15} mins drive
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Embedded Route Map */}
                  <div className="h-64 rounded-xl overflow-hidden border border-slate-300">
                    <GoogleMapsView
                      center={{ lat: detailedHospital.lat, lng: detailedHospital.lng }}
                      zoom={13}
                      className="w-full h-full"
                      markers={[
                        ...(userLocation
                          ? [
                              {
                                id: 'origin',
                                lat: userLocation.lat,
                                lng: userLocation.lng,
                                title: 'Your Location',
                                type: 'user' as const,
                              },
                            ]
                          : []),
                        {
                          id: detailedHospital.id,
                          lat: detailedHospital.lat,
                          lng: detailedHospital.lng,
                          title: detailedHospital.name,
                          subtitle: detailedHospital.address,
                          type: 'hospital' as const,
                        },
                      ]}
                      routePoints={
                        userLocation
                          ? [
                              userLocation,
                              {
                                lat: (userLocation.lat + detailedHospital.lat) / 2 + 0.002,
                                lng: (userLocation.lng + detailedHospital.lng) / 2 - 0.002,
                              },
                              { lat: detailedHospital.lat, lng: detailedHospital.lng },
                            ]
                          : []
                      }
                    />
                  </div>

                  {/* Open in Google Maps External Button */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">
                      View full turn-by-turn navigation on Google Maps app:
                    </span>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${
                        userLocation ? `${userLocation.lat},${userLocation.lng}` : ''
                      }&destination=${detailedHospital.lat},${detailedHospital.lng}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Open in Google Maps</span>
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E3E8EB] bg-slate-50/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDetailedHospital(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedHospitalId(detailedHospital.id);
                  setDetailedHospital(null);
                }}
                className="px-5 py-2 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
              >
                Select this Hospital for Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DEVICE PERMISSION NOTIFICATION & REQUEST MODAL                */}
      {/* ------------------------------------------------------------- */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E3E8EB] max-w-lg w-full max-h-[92vh] overflow-y-auto flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E3E8EB] flex items-start justify-between gap-3 bg-gradient-to-r from-teal-50/70 to-slate-50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center shrink-0 text-[#0E7C7B]">
                  {permissionModalFocus === 'camera' ? (
                    <Camera className="w-5 h-5 text-[#0E7C7B]" />
                  ) : (
                    <Mic className="w-5 h-5 text-[#0E7C7B]" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Device Access & Permissions</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      Browser Prompt
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    MediTrack needs microphone access to dictate health problems hands-free, and camera access to attach clinical photos for your consultation.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPermissionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Status Notice if present */}
              {permissionRequestNotice && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2 ${
                    permissionRequestNotice.includes('successfully') || permissionRequestNotice.includes('granted!')
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{permissionRequestNotice}</span>
                </div>
              )}

              {/* Live Permission Cards */}
              <div className="space-y-3">
                {/* Microphone Card */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    micPermissionStatus === 'granted'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : micPermissionStatus === 'denied'
                      ? 'bg-red-50/50 border-red-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          micPermissionStatus === 'granted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : micPermissionStatus === 'denied'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-teal-100 text-[#0E7C7B]'
                        }`}
                      >
                        <Mic className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-xs">Microphone (Speech-to-Text)</div>
                        <div className="text-[11px] text-slate-500">
                          Dictate symptoms in English, Hindi, or Punjabi
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {micPermissionStatus === 'granted' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span>Allowed</span>
                        </span>
                      ) : micPermissionStatus === 'denied' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-red-600" />
                          <span>Blocked</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                          Not Allowed Yet
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={isRequestingPermissions}
                        onClick={() => handleGrantPermissions('mic')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs ${
                          micPermissionStatus === 'granted'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white'
                        }`}
                      >
                        {micPermissionStatus === 'granted' ? 'Test Mic' : 'Allow Mic'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Camera Card */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    cameraPermissionStatus === 'granted'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : cameraPermissionStatus === 'denied'
                      ? 'bg-red-50/50 border-red-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          cameraPermissionStatus === 'granted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : cameraPermissionStatus === 'denied'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-teal-100 text-[#0E7C7B]'
                        }`}
                      >
                        <Camera className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-xs">Camera (Clinical Photos)</div>
                        <div className="text-[11px] text-slate-500">
                          Capture rash, injury, or test document photos
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {cameraPermissionStatus === 'granted' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span>Allowed</span>
                        </span>
                      ) : cameraPermissionStatus === 'denied' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-red-600" />
                          <span>Blocked</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                          Not Allowed Yet
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={isRequestingPermissions}
                        onClick={() => handleGrantPermissions('camera')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs ${
                          cameraPermissionStatus === 'granted'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white'
                        }`}
                      >
                        {cameraPermissionStatus === 'granted' ? 'Open Camera' : 'Allow Camera'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Allow Both Button */}
              <button
                type="button"
                disabled={isRequestingPermissions}
                onClick={() => handleGrantPermissions('both')}
                className="w-full py-2.5 rounded-xl bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-transform active:scale-[0.99]"
              >
                {isRequestingPermissions ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>Grant Microphone &amp; Camera Permissions (One-Click)</span>
              </button>

              {/* Step-by-Step Browser Unblock Guide */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Lock className="w-3.5 h-3.5 text-[#0E7C7B]" />
                    <span>How to Unblock in Your Browser Address Bar</span>
                  </span>

                  {/* Browser Selector Tabs */}
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPermissionGuideBrowser('chrome')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                        permissionGuideBrowser === 'chrome'
                          ? 'bg-[#0E7C7B] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Chrome / Edge
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissionGuideBrowser('safari')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                        permissionGuideBrowser === 'safari'
                          ? 'bg-[#0E7C7B] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Safari
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissionGuideBrowser('firefox')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                        permissionGuideBrowser === 'firefox'
                          ? 'bg-[#0E7C7B] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Firefox
                    </button>
                  </div>
                </div>

                {/* Browser Address Bar Visual Mockup */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-300 font-mono text-[11px] text-slate-700 flex items-center gap-2 shadow-inner">
                  <div className="flex items-center gap-1 text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 font-bold">
                    <Lock className="w-3 h-3 text-[#0E7C7B]" />
                    <span>Tap Here</span>
                  </div>
                  <span className="text-slate-400">https://meditrack.health/appointments/wizard</span>
                </div>

                {/* Instructions based on selected browser */}
                {permissionGuideBrowser === 'chrome' && (
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 leading-relaxed">
                    <li>
                      Click the <strong className="text-slate-800">🔒 Lock</strong> or <strong className="text-slate-800">🎚️ Tune/Site settings</strong> icon to the left of the URL bar above.
                    </li>
                    <li>
                      Look for <strong className="text-slate-800">Microphone</strong> and <strong className="text-slate-800">Camera</strong> in the dropdown menu.
                    </li>
                    <li>
                      Change their setting from <span className="text-red-600 font-semibold">&quot;Block&quot;</span> to <span className="text-emerald-700 font-bold">&quot;Allow&quot;</span>.
                    </li>
                    <li>Click the button below to verify access.</li>
                  </ol>
                )}

                {permissionGuideBrowser === 'safari' && (
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 leading-relaxed">
                    <li>
                      In Safari, tap <strong className="text-slate-800">Safari &gt; Settings for This Website</strong> (or the <strong className="text-slate-800">AA</strong> icon on iOS).
                    </li>
                    <li>
                      Find <strong className="text-slate-800">Microphone</strong> and <strong className="text-slate-800">Camera</strong> and select <span className="text-emerald-700 font-bold">&quot;Allow&quot;</span>.
                    </li>
                    <li>Refresh or tap &quot;Re-check Access&quot; below.</li>
                  </ol>
                )}

                {permissionGuideBrowser === 'firefox' && (
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 leading-relaxed">
                    <li>
                      Click the <strong className="text-slate-800">Permissions icon</strong> on the left side of the address bar.
                    </li>
                    <li>
                      Remove the <span className="text-red-600 font-semibold">&quot;Blocked Temporarily&quot;</span> or &quot;Blocked&quot; cross next to Microphone.
                    </li>
                    <li>Reload the page or click &quot;Re-check Access&quot;.</li>
                  </ol>
                )}

                <div className="pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleGrantPermissions('both')}
                    className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-md text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-[#0E7C7B]" />
                    <span>Re-check Permissions</span>
                  </button>
                  <span className="text-[10px] text-slate-400">Settings are remembered by browser</span>
                </div>
              </div>

              {/* Instant Voice Note Simulation (For testing or no-mic environments) */}
              <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-900 flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-[#0E7C7B]" />
                    <span>Testing or no hardware microphone? Try quick sample:</span>
                  </span>
                  <span className="text-[10px] text-teal-700 font-mono">1-click test</span>
                </div>
                <p className="text-[11px] text-teal-800/90 leading-relaxed">
                  Choose a simulated spoken symptom note to test clinical transcription and AI specialty matching immediately:
                </p>

                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleSimulateVoiceInput(
                        'Severe chest discomfort radiating to left shoulder and jaw with shortness of breath for 2 days.'
                      )
                    }
                    className="p-2 rounded-lg bg-white border border-teal-200 hover:border-[#0E7C7B] hover:bg-teal-50/50 text-left text-[11px] text-slate-800 font-medium cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <span>🫀 &quot;Severe chest discomfort radiating to left shoulder...&quot;</span>
                    <span className="text-[10px] text-teal-700 font-bold ml-2 shrink-0">Cardiology →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSimulateVoiceInput(
                        'Severe acute pain and swelling in right ankle joint after twisting foot playing football.'
                      )
                    }
                    className="p-2 rounded-lg bg-white border border-teal-200 hover:border-[#0E7C7B] hover:bg-teal-50/50 text-left text-[11px] text-slate-800 font-medium cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <span>🦴 &quot;Severe pain and swelling in right ankle joint after fall...&quot;</span>
                    <span className="text-[10px] text-teal-700 font-bold ml-2 shrink-0">Orthopedics →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleSimulateVoiceInput(
                        'Spreading itchy red rash and hives on both arms with burning sensation for past 3 days.'
                      )
                    }
                    className="p-2 rounded-lg bg-white border border-teal-200 hover:border-[#0E7C7B] hover:bg-teal-50/50 text-left text-[11px] text-slate-800 font-medium cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <span>🧴 &quot;Spreading itchy red rash and hives on both arms...&quot;</span>
                    <span className="text-[10px] text-teal-700 font-bold ml-2 shrink-0">Dermatology →</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E3E8EB] bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowPermissionModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-white cursor-pointer"
              >
                Close &amp; Type Manually
              </button>

              <button
                type="button"
                disabled={isRequestingPermissions}
                onClick={() => handleGrantPermissions('both')}
                className="px-5 py-2 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Grant Permissions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 3: CHOOSE DOCTOR, DATE AND TIME                          */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 3 && (
        <div className="bg-white rounded-xl border border-[#E3E8EB] p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E3E8EB]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-[#0E7C7B]">
                  Step 3 of 6
                </span>
                <span className="text-xs text-slate-500 font-medium">Doctor, Date and Time</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">Select Specialist Doctor & Consultation Slot</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hospital: <span className="font-semibold text-slate-800">{selectedHospital?.name || 'Selected Facility'}</span> • Matched Specialty:{' '}
                <span className="font-semibold text-[#0E7C7B]">{matchedSpecialty}</span>
              </p>
            </div>

            {/* 10-Minute Hold Reservation Badge / Countdown */}
            {holdToken && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-2.5 shrink-0 shadow-2xs animate-in fade-in">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Timer className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>Slot Held:</span>
                    <span className="font-mono text-emerald-700 bg-white px-1.5 py-0.2 rounded border border-emerald-300">
                      {Math.floor(holdSecondsRemaining / 60)}:{String(holdSecondsRemaining % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-800">
                    {selectedDate} at {selectedTimeSlot}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hold Error Alert */}
          {holdError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{holdError}</span>
            </div>
          )}

          {/* 1. CHOOSE A SPECIALIST DOCTOR */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-[#0E7C7B]" />
                <span>1. Choose Specialist Physician</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  ({displayedDoctors.length} available at this hospital)
                </span>
              </label>

              {/* Specialty Filter Toggle */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAllDoctorsAtHospital(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    !showAllDoctorsAtHospital
                      ? 'bg-[#0E7C7B] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Matched Specialty ({matchedSpecialty})
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllDoctorsAtHospital(true)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    showAllDoctorsAtHospital
                      ? 'bg-[#0E7C7B] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Show All Doctors ({hospitalDoctors.length})
                </button>
              </div>
            </div>

            {/* Doctors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayedDoctors.map((doc) => {
                const isSelected = selectedDoctor?.id === doc.id;
                const isSpecialistMatch =
                  doc.specialization.toLowerCase().includes(matchedSpecialty.toLowerCase()) ||
                  matchedSpecialty.toLowerCase().includes(doc.specialization.toLowerCase());

                return (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoctor(doc.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'border-[#0E7C7B] bg-teal-50/30 ring-2 ring-teal-200 shadow-xs'
                        : 'border-[#E3E8EB] bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? 'bg-[#0E7C7B] text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {doc.name
                            .replace('Dr. ', '')
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                            <span>{doc.name}</span>
                            {isSpecialistMatch && (
                              <span className="text-[10px] bg-teal-100 text-[#0E7C7B] px-1.5 py-0.2 rounded font-bold">
                                Match
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#0E7C7B] font-semibold">{doc.specialization}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {doc.experienceYears} yrs exp • {doc.roomNumber || 'OPD Cabin'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-slate-900 block text-sm">
                          ₹{doc.consultationFee || serverDoctorFee || 650}
                        </span>
                        <span className="text-[10px] text-slate-400">Consultation Fee</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Avg. {doc.avgConsultationTimeMinutes || 10} mins / consultation</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : doc.status === 'available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isSelected ? 'Doctor Selected' : doc.status === 'available' ? 'Available Today' : 'In Consultation'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {displayedDoctors.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed rounded-xl bg-slate-50">
                No doctors currently listed for this specialty at this hospital. Click &quot;Show All Doctors&quot; to view available physicians.
              </div>
            )}
          </div>

          {/* 2. SELECT DATE (NO PAST DATES, NO LEAVES / HOLIDAYS) */}
          <div className="space-y-3 pt-3 border-t border-[#E3E8EB]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#0E7C7B]" />
                <span>2. Select Consultation Date</span>
                <span className="text-[11px] text-slate-500 font-normal">(Past dates disabled)</span>
              </label>

              {/* Quick Date Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'Today (Oct 30)', dateStr: '2026-10-30' },
                  { label: 'Tomorrow (Oct 31)', dateStr: '2026-10-31' },
                  { label: 'Sun (Nov 1)', dateStr: '2026-11-01' },
                  { label: 'Mon (Nov 2)', dateStr: '2026-11-02' },
                ].map((chip) => (
                  <button
                    key={chip.dateStr}
                    type="button"
                    onClick={() => handleSelectDate(chip.dateStr)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      selectedDate === chip.dateStr
                        ? 'bg-[#0E7C7B] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Input (Strict min = 2026-10-30) */}
            <div className="flex items-center gap-3">
              <input
                type="date"
                min="2026-10-30"
                value={selectedDate}
                onChange={(e) => handleSelectDate(e.target.value)}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-[#E3E8EB] bg-white text-slate-800 focus:outline-none focus:border-[#0E7C7B]"
              />
              <span className="text-xs text-slate-500">
                Selected: <span className="font-semibold text-slate-800">{selectedDate}</span>
              </span>
            </div>

            {/* Doctor Leave or Holiday Warning Alert */}
            {leaveOrHolidayNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Doctor Leave / Hospital Holiday Notice</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  {selectedDoctor?.name} is not taking outpatient appointments on {selectedDate}:{' '}
                  <span className="font-semibold">&quot;{leaveOrHolidayNotice}&quot;</span>. Please choose another date or doctor.
                </p>
              </div>
            )}
          </div>

          {/* 3. SHOW AVAILABLE SLOTS (BOOKED DISABLED, 10-MIN TRANSACTION HOLD) */}
          {!leaveOrHolidayNotice && (
            <div className="space-y-3 pt-3 border-t border-[#E3E8EB]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#0E7C7B]" />
                  <span>3. Choose Time Slot</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (Clicking a slot holds it for 10 minutes via transactional reservation)
                  </span>
                </label>

                {isLoadingSlots && (
                  <div className="flex items-center gap-1 text-[11px] text-[#0E7C7B]">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Loading real-time slots...</span>
                  </div>
                )}
              </div>

              {/* Slots Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                {slotsList.map((slot) => {
                  const isBooked = slot.status === 'booked';
                  const isHeldByOther = slot.status === 'held_by_other';
                  const isHeldByYou = slot.status === 'held_by_you' || selectedTimeSlot === slot.time;
                  const isAvailable = slot.status === 'available' || isHeldByYou;

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!isAvailable || isHoldingSlot}
                      onClick={() => handleHoldSlot(slot.time)}
                      className={`p-2.5 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                        isHeldByYou
                          ? 'bg-[#0E7C7B] text-white ring-2 ring-teal-200 shadow-xs'
                          : isBooked
                          ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed border border-slate-200'
                          : isHeldByOther
                          ? 'bg-amber-50 text-amber-700/60 cursor-not-allowed border border-amber-200'
                          : 'bg-white border border-[#E3E8EB] text-slate-800 hover:border-[#0E7C7B] hover:bg-teal-50/30 cursor-pointer'
                      }`}
                    >
                      <span className="font-mono">{slot.time}</span>
                      <span className="text-[10px] font-normal">
                        {isHeldByYou
                          ? 'Held by You'
                          : isBooked
                          ? 'Booked'
                          : isHeldByOther
                          ? 'Held (10m)'
                          : 'Available'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Hold Expiry / Terms Note */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                <span>
                  Consultation Fee: <span className="font-bold text-slate-900">₹{serverDoctorFee}</span> (locked by hospital server registry)
                </span>
                <span className="text-slate-400">Slots refresh automatically</span>
              </div>
            </div>
          )}

          {/* Navigation Buttons for Step 3 */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E3E8EB]">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Step 2 (Hospital)</span>
            </button>

            <button
              type="button"
              disabled={!selectedDoctor?.id || !selectedDate || !selectedTimeSlot || !holdToken}
              onClick={handleNextFromStep3}
              className="px-6 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <span>Next: Your Details & Patient ID Check</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 4: PATIENT ID CHECK AND APPOINTMENT RECORD               */}
      {/* ------------------------------------------------------------- */}
      {currentStep === 4 && (
        <div className="bg-white rounded-xl border border-[#E3E8EB] p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E3E8EB]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-[#0E7C7B]">
                  Step 4 of 6
                </span>
                <span className="text-xs text-slate-500 font-medium">Your Details</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">Patient ID Check & Appointment Record</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify your identity to bind your clinical summary and lock your reserved appointment record.
              </p>
            </div>

            {/* Persistent Hold Countdown */}
            {holdToken && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-2 shrink-0">
                <Timer className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-emerald-900">
                  Hold Active:{' '}
                  <span className="font-mono text-emerald-700">
                    {Math.floor(holdSecondsRemaining / 60)}:{String(holdSecondsRemaining % 60).padStart(2, '0')}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Reserved Slot Snapshot Banner */}
          <div className="p-3.5 rounded-xl bg-teal-50/50 border border-teal-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0E7C7B]" />
              <span className="font-bold text-teal-950">
                Slot Reserved with {selectedDoctor?.name}:
              </span>
              <span className="text-slate-700 font-medium">
                {selectedDate} at {selectedTimeSlot} ({selectedHospital?.name})
              </span>
            </div>
            <div className="font-mono font-bold text-[#0E7C7B]">
              Consultation Fee: ₹{serverDoctorFee} (Locked)
            </div>
          </div>

          {/* Creation Error Notice */}
          {createAppointmentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{createAppointmentError}</span>
            </div>
          )}

          {/* CASE 1: LOGGED-IN / VERIFIED PATIENT */}
          {isVerifiedPatient && verifiedPatientId ? (
            <div className="space-y-4">
              {/* Verified Account Banner */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-emerald-950">Verified Patient Account</h4>
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-white text-emerald-900 border border-emerald-300">
                        {verifiedPatientId}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Logged in as <span className="font-semibold">{patientFullName}</span> ({patientEmail}). Details retrieved from your secure health profile.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsVerifiedPatient(false);
                    setVerifiedPatientId('');
                  }}
                  className="text-xs text-emerald-800 hover:text-emerald-950 underline font-semibold cursor-pointer"
                >
                  Switch Account
                </button>
              </div>

              {/* Patient Details Form (Auto-filled & Verified) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    value={patientFullName}
                    onChange={(e) => setPatientFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-slate-50 font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unique Patient ID</label>
                  <input
                    type="text"
                    readOnly
                    value={verifiedPatientId}
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-slate-100 font-mono font-bold text-[#0E7C7B]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Phone Number (+91)</label>
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Date of Birth & Gender</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={patientDob}
                      onChange={(e) => setPatientDob(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800"
                    />
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value as any)}
                      className="px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800 font-semibold"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Blood Group</label>
                  <select
                    value={patientBloodGroup}
                    onChange={(e) => setPatientBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800 font-semibold"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">Reported Allergies</label>
                  <input
                    type="text"
                    value={patientAllergies}
                    onChange={(e) => setPatientAllergies(e.target.value)}
                    placeholder="e.g. Penicillin, Peanuts, Sulfa Antibiotics (or None)"
                    className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] bg-white text-slate-800"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* CASE 2: UNVERIFIED / NOT LOGGED IN */
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Authentication Required:</span> Never accept a Patient ID typed alone without credentials. Random Patient IDs are rejected. Please log into your existing account or register as a new patient below.
                </div>
              </div>

              {/* Tabs: Login vs Register */}
              <div className="flex border-b border-[#E3E8EB]">
                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    authTab === 'login'
                      ? 'border-[#0E7C7B] text-[#0E7C7B]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Existing Patient Login
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab('register')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    authTab === 'register'
                      ? 'border-[#0E7C7B] text-[#0E7C7B]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  New Patient Registration (Inline)
                </button>
              </div>

              {/* TAB 1: EXISTING PATIENT LOGIN */}
              {authTab === 'login' && (
                <form onSubmit={handleLoginExistingPatient} className="space-y-3.5 max-w-lg">
                  {loginError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Email Address or Patient ID
                    </label>
                    <input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="e.g. sarah.chen@example.com or PT00234"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Account Password
                    </label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your account password (e.g. Password123)"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="px-5 py-2 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {isLoggingIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>Log In & Auto-fill Details</span>
                    </button>
                  </div>

                  {/* One-Click Demo Credentials for Evaluator Convenience */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[11px] text-slate-500 font-medium block">
                      Quick Demo Patient Accounts:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginIdentifier('sarah.chen@example.com');
                          setLoginPassword('Password123');
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-teal-50 hover:text-[#0E7C7B] text-slate-700 text-[11px] font-semibold border border-slate-200 cursor-pointer"
                      >
                        Sarah Chen (PT00234)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginIdentifier('rajesh.patel@example.com');
                          setLoginPassword('Password123');
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-teal-50 hover:text-[#0E7C7B] text-slate-700 text-[11px] font-semibold border border-slate-200 cursor-pointer"
                      >
                        Rajesh Patel (PT00582)
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* TAB 2: NEW PATIENT REGISTRATION WITH EMAIL & PHONE OTP */}
              {authTab === 'register' && (
                <form onSubmit={handleCompleteRegistration} className="space-y-3.5">
                  {regError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{regError}</span>
                    </div>
                  )}

                  {regSuccessMessage && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{regSuccessMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Full Legal Name *</label>
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="e.g. Manpreet Kaur"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Email Address *</label>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="e.g. manpreet.k@example.com"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Phone Number (+91) *</label>
                      <input
                        type="tel"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="e.g. 98112 88990"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Create Account Password *</label>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Min 8 characters (letter + number)"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB] focus:outline-none focus:border-[#0E7C7B]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Date of Birth & Gender</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={regDob}
                          onChange={(e) => setRegDob(e.target.value)}
                          className="px-3 py-2 rounded-lg border border-[#E3E8EB]"
                        />
                        <select
                          value={regGender}
                          onChange={(e) => setRegGender(e.target.value as any)}
                          className="px-3 py-2 rounded-lg border border-[#E3E8EB]"
                        >
                          <option value="Female">Female</option>
                          <option value="Male">Male</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Blood Group</label>
                      <select
                        value={regBloodGroup}
                        onChange={(e) => setRegBloodGroup(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB]"
                      >
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                          <option key={bg} value={bg}>
                            {bg}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Emergency Contact Name</label>
                      <input
                        type="text"
                        value={regEmergencyContactName}
                        onChange={(e) => setRegEmergencyContactName(e.target.value)}
                        placeholder="e.g. Gurpreet Singh (Spouse)"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        value={regEmergencyContactPhone}
                        onChange={(e) => setRegEmergencyContactPhone(e.target.value)}
                        placeholder="e.g. +91 98112 77889"
                        className="w-full px-3 py-2 rounded-lg border border-[#E3E8EB]"
                      />
                    </div>
                  </div>

                  {/* Phone OTP & Email Verification Block */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#0E7C7B]" />
                        <span>Phone OTP & Email Verification</span>
                      </span>
                      {!isOtpSent && (
                        <button
                          type="button"
                          onClick={handleSendOtpForRegistration}
                          className="px-3 py-1 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold rounded-md cursor-pointer"
                        >
                          Send Verification OTP
                        </button>
                      )}
                    </div>

                    {isOtpSent && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={enteredOtpCode}
                            onChange={(e) => setEnteredOtpCode(e.target.value)}
                            placeholder="Enter 6-digit Phone OTP"
                            className="px-3 py-1.5 text-xs font-mono font-bold rounded-md border border-slate-300 w-48 text-center"
                          />
                          <button
                            type="button"
                            onClick={handleSendOtpForRegistration}
                            className="text-[11px] text-[#0E7C7B] hover:underline font-semibold"
                          >
                            Resend OTP
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Verification code sent to registered contact. Entering the 6-digit OTP issues your unique Patient ID (PT + 5 digits).
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="px-6 py-2.5 bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    {isRegistering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                    <span>Complete Registration & Generate Patient ID</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Action Row: Create Appointment Record */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E3E8EB]">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Step 3 (Doctor & Time)</span>
            </button>

            <button
              type="button"
              disabled={!isVerifiedPatient || isCreatingAppointment}
              onClick={handleCreateAppointmentRecord}
              className="px-6 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              {isCreatingAppointment ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Locking Record on Server...</span>
                </>
              ) : (
                <>
                  <span>Create Appointment Record</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PLACEHOLDER STEPS 5 & 6 (Payment & Confirmation)             */}
      {/* ------------------------------------------------------------- */}
      {currentStep > 4 && (
        <div className="bg-white rounded-xl border border-[#E3E8EB] p-6 space-y-6 animate-in fade-in">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E8EB]">
            <div>
              <span className="text-[11px] font-bold text-[#0E7C7B] uppercase tracking-wider">
                Step {currentStep} of 6 • {currentStep === 5 ? 'Payment & Reservation' : 'Final Confirmation'}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {currentStep === 5
                  ? 'Step 5: Payment Method & Final Token Allocation'
                  : 'Step 6: Appointment Confirmation Card'}
              </h2>
            </div>
            <span className="px-2.5 py-1 rounded bg-teal-50 text-[#0E7C7B] border border-teal-200 text-xs font-semibold">
              Parts 1, 2, & 3 Completed
            </span>
          </div>

          {/* CREATED APPOINTMENT RECORD DISPLAY */}
          {createdAppointment ? (
            <div className="p-5 rounded-2xl bg-teal-50/50 border border-teal-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0E7C7B] text-white flex items-center justify-center font-bold">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Appointment Record Created</h3>
                    <span className="font-mono text-xs text-[#0E7C7B] font-bold">
                      ID: {createdAppointment.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Status: {createdAppointment.appointmentStatus}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Payment: {createdAppointment.paymentStatus}
                  </span>
                </div>
              </div>

              {/* Grid of locked details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-700">
                <div>
                  <span className="text-slate-500 block text-[11px]">Patient Details:</span>
                  <span className="font-bold text-slate-900">{createdAppointment.patientName}</span>
                  <span className="font-mono text-teal-800 text-[11px] block">
                    ID: {createdAppointment.uniquePatientId}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Consultant Physician:</span>
                  <span className="font-bold text-slate-900">{createdAppointment.doctorName}</span>
                  <span className="text-[11px] text-slate-500 block">{createdAppointment.department}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Date & Time Slot:</span>
                  <span className="font-bold text-slate-900">{createdAppointment.date}</span>
                  <span className="text-[11px] text-slate-500 block">{createdAppointment.timeSlot}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Authoritative Consultation Fee:</span>
                  <span className="font-mono font-bold text-base text-slate-900 block">
                    ₹{createdAppointment.fee}
                  </span>
                  <span className="text-[10px] text-slate-400">Locked by Hospital Server</span>
                </div>
              </div>

              {/* Case Summary Preview */}
              <div className="pt-2 border-t border-teal-200/60 text-xs space-y-1">
                <span className="text-slate-500 font-semibold block text-[11px]">
                  Case Summary & Triage Suggestion:
                </span>
                <p className="text-slate-700 text-xs italic bg-white p-2.5 rounded-lg border border-teal-100">
                  &quot;{createdAppointment.caseSummary || problemSummary}&quot;
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="font-bold text-[#0E7C7B]">AI Specialty Suggestion:</span>
                  <span>{createdAppointment.aiSpecialtySuggestion}</span>
                  <span className="text-slate-400">•</span>
                  <span className="font-bold text-slate-700">Urgency:</span>
                  <span>{createdAppointment.urgencyLevel}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <CalendarClock className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                Payment and confirmation wizard steps
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Part 3 is complete. The appointment record has been generated and validated with a 10-minute hold. Payment processing and final token issuance will be implemented in subsequent parts.
              </p>
            </div>
          )}

          {/* Navigation Buttons for Placeholders */}
          <div className="flex items-center justify-between pt-3 border-t border-[#E3E8EB]">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-lg border border-[#E3E8EB] text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Step {currentStep - 1}</span>
            </button>

            {currentStep < 6 ? (
              <button
                type="button"
                onClick={handleNextPlaceholder}
                className="px-5 py-2.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Preview Step {currentStep + 1}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-5 py-2.5 rounded-lg border border-[#0E7C7B] text-[#0E7C7B] text-xs font-bold hover:bg-teal-50 cursor-pointer"
              >
                Restart Wizard from Step 1
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
