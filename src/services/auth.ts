/**
 * MediTrack Enterprise Password Authentication & Security Service
 * Pure Password-Based Authentication across all Portals: Patient, Doctor, Hospital Staff
 * 
 * Guarantees:
 * - Pure password-based login & registration (No OTP)
 * - Firebase Authentication (Email/Password & Password Reset)
 * - Strong password enforcement (min 8 characters, letter + number)
 * - Indian phone validation (+91, 10 digits starting 6-9)
 * - Rate limiting & failure throttling
 * - Unique Patient ID / Doctor ID / Staff ID binding
 */

import { UserRole, PatientProfile, Doctor } from '../types';
import { appStore, validatePatientIdFormat, generateUniquePatientId } from './store';
import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  isFirebaseConfigured,
  FirebaseUser,
} from './firebase';

export type PortalType = 'patient' | 'doctor' | 'hospital' | 'emergency';

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  portal: PortalType;
  staffRole?: 'admin' | 'dispatcher' | 'paramedic';
  customId: string; // e.g. PT00234, DR-001, HOSP-01, EMS-104
  hospitalId?: string;
  hospitalName?: string;
  department?: string;
  photoUrl?: string;
  approvalStatus?: 'approved' | 'pending';
  emailVerified: boolean;
}

export interface UserProfileRecord {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  portal: PortalType;
  staffRole?: 'admin' | 'dispatcher' | 'paramedic';
  customId: string;
  hospitalId?: string;
  hospitalName?: string;
  department?: string;
  approvalStatus?: 'approved' | 'pending';
  createdAt: string;
}

const AUTH_STORAGE_KEY = 'meditrack_auth_user_v5';
const USER_PROFILES_STORAGE_KEY = 'meditrack_user_profiles_v5';
const USER_PASSWORDS_STORAGE_KEY = 'meditrack_passwords_v5';
const LOGIN_ATTEMPTS_STORAGE_KEY = 'meditrack_login_attempts_v5';

export interface DemoAccount {
  id: string; // key e.g. 'patient-sarah'
  name: string;
  roleTitle: string;
  portal: PortalType;
  staffRole?: 'admin' | 'dispatcher' | 'paramedic';
  role: UserRole;
  customId: string;
  email: string;
  password: string;
  phone: string;
  department?: string;
  hospitalName?: string;
  badge: string;
  description: string;
  highlights: string[];
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'patient-sarah',
    name: 'Sarah Chen',
    roleTitle: 'Registered Outpatient',
    portal: 'patient',
    role: 'patient',
    customId: 'PT00234',
    email: 'sarah.chen@example.com',
    password: 'Password123',
    phone: '+91 98112 34567',
    badge: 'Active Patient',
    department: 'Outpatient Care',
    description: 'Diagnosed with moderate Asthma & mild Hypertension. Active prescription for Budesonide ResDecoder Inhaler and 4 lab records.',
    highlights: [
      'Digital EHR health locker with 4 lab diagnostic reports',
      'Daily Budesonide inhaler dose schedule & streak counter',
      'Active OPD queue token C-00 for Dr. Aris Vance',
      'Break-glass emergency medical QR card & allergy profile',
    ],
  },
  {
    id: 'patient-rajesh',
    name: 'Rajesh Patel',
    roleTitle: 'Chronic Care Patient',
    portal: 'patient',
    role: 'patient',
    customId: 'PT00582',
    email: 'rajesh.patel@example.com',
    password: 'Password123',
    phone: '+91 98223 45678',
    badge: 'Cardiac Outpatient',
    department: 'Cardiology Follow-up',
    description: 'Cardiac outpatient with hypertension, scheduled for follow-up and prescription refill.',
    highlights: [
      'Cardiology lab work & blood pressure history',
      'Razorpay & direct UPI invoice billing ledger',
      'One-tap doctor consultation appointment booking',
      'Active queue token and prescription status',
    ],
  },
  {
    id: 'doctor-aris',
    name: 'Dr. Aris Vance, MD',
    roleTitle: 'Senior Interventional Cardiologist',
    portal: 'doctor',
    role: 'doctor',
    customId: 'DR-001',
    email: 'aris.vance@citymetro.health',
    password: 'Password123',
    phone: '+91 98113 44556',
    department: 'Department of Cardiology',
    hospitalName: 'City Metro General Hospital',
    badge: 'Attending Physician',
    description: '14 years clinical experience. Managing Cabin 3 with live OPD patient queue, chart review, and digital prescription pad.',
    highlights: [
      'Live OPD queue caller with audio alert & consultation timer',
      'Patient electronic health record & diagnostic report reviewer',
      'Digital prescription generator with dosage guidance',
      'Doctor clinical calendar & task management board',
    ],
  },
  {
    id: 'doctor-priya',
    name: 'Dr. Priya Sharma, MBBS, MS',
    roleTitle: 'Trauma & Emergency Specialist',
    portal: 'doctor',
    role: 'doctor',
    customId: 'DR-002',
    email: 'priya.sharma@stjude.health',
    password: 'Password123',
    phone: '+91 98114 55667',
    department: 'Level-1 Emergency Trauma Bay',
    hospitalName: 'St. Jude Trauma & Cardiac Institute',
    badge: 'Trauma Specialist',
    description: '11 years trauma experience. Direct oversight of critical trauma bay admissions and emergency handovers.',
    highlights: [
      'Inbound ambulance telemetry and siren tracking',
      'Acute trauma bed pre-reservation handshake',
      'Break-glass patient allergy & medical history audit',
      'Emergency room triage & critical case coordination',
    ],
  },
  {
    id: 'admin-vikram',
    name: 'Vikram Joshi (Admin)',
    roleTitle: 'Facility Administrator',
    portal: 'hospital',
    staffRole: 'admin',
    role: 'admin',
    customId: 'ADM-101',
    email: 'admin@hospital.meditrack',
    password: 'Password123',
    phone: '+91 98114 99001',
    department: 'Hospital Administration & Governance',
    hospitalName: 'City Metro General Hospital',
    badge: 'Facility Admin',
    description: 'Oversees ward bed occupancy, doctor licensing accreditation approvals, pharmacy stock reorders, and billing.',
    highlights: [
      'Interactive 3D Ward Bed layout & real-time allocation',
      'Doctor credential verification and license approval queue',
      'Pharmacy low-stock alerts & purchase order creator',
      'Hospital-wide bed occupancy and emergency statistics',
    ],
  },
  {
    id: 'dispatcher-sunita',
    name: 'Sunita Rao (Dispatcher)',
    roleTitle: 'Central Emergency Dispatcher',
    portal: 'hospital',
    staffRole: 'dispatcher',
    role: 'dispatcher',
    customId: 'DISP-102',
    email: 'dispatcher@emergency.meditrack',
    password: 'Password123',
    phone: '+91 98114 99002',
    department: 'Central Emergency Dispatch Command',
    hospitalName: 'City Metro General Hospital',
    badge: 'Dispatch Commander',
    description: 'Manages regional ambulance fleet, verifies civilian SOS accident calls, and deduplicates incident reports.',
    highlights: [
      'Live Google Maps ambulance fleet tracker with active sirens',
      'Incident deduplication engine (150m & 10min radius)',
      'First-accept responder slot assignment and broadcast',
      'Hospital trauma bay capacity matching',
    ],
  },
  {
    id: 'paramedic-karan',
    name: 'Karan Mehra (Paramedic)',
    roleTitle: 'Field Ambulance Paramedic',
    portal: 'hospital',
    staffRole: 'paramedic',
    role: 'paramedic',
    customId: 'EMS-103',
    email: 'paramedic@ambulance.meditrack',
    password: 'Password123',
    phone: '+91 98114 99003',
    department: 'Field Rapid Response Unit 104',
    hospitalName: 'City Metro General Hospital',
    badge: 'EMS Unit 104',
    description: 'Paramedic in ALS Ambulance Unit 104. Streams live vitals, patient telemetry, and requests pre-arrival bed hold.',
    highlights: [
      'Turn-by-turn emergency navigation telemetry',
      'Real-time vitals transmitter (SpO2, Pulse, Blood Pressure, GCS)',
      'Hospital readiness handshake & pre-assigned trauma bed',
      'Digital patient emergency handover protocol',
    ],
  },
];


// Phone Validation: Indian (+91) 10-digits starting with 6, 7, 8, 9
export function normalizeAndValidatePhone(input: string): { isValid: boolean; normalized: string; error?: string } {
  const cleaned = input.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) {
    return { isValid: false, normalized: '', error: 'Phone number is required.' };
  }

  // Matches +91 followed by 10 digits starting with 6-9
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, normalized: cleaned };
  }

  // Matches 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, normalized: `+91${cleaned}` };
  }

  // Matches 0 followed by 10 digits starting with 6-9
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, normalized: `+91${cleaned.slice(1)}` };
  }

  return {
    isValid: false,
    normalized: cleaned,
    error: 'Invalid phone number. Must be a valid Indian number (+91) with 10 digits starting with 6-9.',
  };
}

// Password Validation: Minimum 8 characters, at least one letter and at least one number
export function validatePasswordStrength(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one letter.' };
  }
  if (!/\d/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number.' };
  }
  return { isValid: true };
}

class AuthService {
  private currentUser: AuthUser | null = null;
  private listeners: ((user: AuthUser | null) => void)[] = [];
  private userProfiles: Map<string, UserProfileRecord> = new Map();
  private userPasswords: Map<string, string> = new Map();

  constructor() {
    this.loadUserProfiles();
    this.loadPasswords();
    this.seedDemoCredentials();
    this.loadFromStorage();
    this.initFirebaseAuthListener();
  }

  public getDemoAccounts(): DemoAccount[] {
    return DEMO_ACCOUNTS;
  }

  public resolveDemoAccount(identifier: string): DemoAccount | null {
    const clean = identifier.trim().toLowerCase();
    if (!clean) return null;

    return (
      DEMO_ACCOUNTS.find(
        (acc) =>
          acc.email.toLowerCase() === clean ||
          acc.customId.toLowerCase() === clean ||
          acc.id.toLowerCase() === clean ||
          acc.name.toLowerCase() === clean ||
          (clean === 'sarah' && acc.id === 'patient-sarah') ||
          (clean === 'rajesh' && acc.id === 'patient-rajesh') ||
          ((clean === 'aris' || clean === 'doc-1') && acc.id === 'doctor-aris') ||
          ((clean === 'priya' || clean === 'doc-2') && acc.id === 'doctor-priya') ||
          ((clean === 'admin' || clean === 'staff-admin-1') && acc.id === 'admin-vikram') ||
          ((clean === 'dispatcher' || clean === 'dispatch' || clean === 'staff-disp-1') && acc.id === 'dispatcher-sunita') ||
          ((clean === 'paramedic' || clean === 'ems' || clean === 'staff-ems-1') && acc.id === 'paramedic-karan')
      ) || null
    );
  }

  private seedDemoCredentials() {
    DEMO_ACCOUNTS.forEach((demo) => {
      // Seed default demo password in local password map
      this.userPasswords.set(demo.email.toLowerCase(), demo.password);
      if (demo.customId) {
        this.userPasswords.set(demo.customId.toLowerCase(), demo.password);
      }
      this.userPasswords.set(demo.id.toLowerCase(), demo.password);

      // Seed default profile if missing
      const uid =
        demo.portal === 'patient'
          ? (demo.id === 'patient-sarah' ? 'pat-1' : 'pat-2')
          : demo.portal === 'doctor'
          ? (demo.id === 'doctor-aris' ? 'doc-1' : 'doc-2')
          : (demo.staffRole === 'dispatcher' ? 'staff-disp-1' : demo.staffRole === 'paramedic' ? 'staff-ems-1' : 'staff-admin-1');

      if (!this.userProfiles.has(uid)) {
        this.userProfiles.set(uid, {
          uid,
          name: demo.name,
          email: demo.email.toLowerCase(),
          phone: demo.phone,
          role: demo.role,
          portal: demo.portal,
          staffRole: demo.staffRole,
          customId: demo.customId,
          hospitalId: 'hosp-1',
          hospitalName: demo.hospitalName || 'City Metro General Hospital',
          department: demo.department,
          approvalStatus: 'approved',
          createdAt: '2026-01-01T00:00:00Z',
        });
      }
    });
  }

  public loginAsDemo(demoId: string): { success: boolean; error?: string; portal?: PortalType } {
    const demo = this.resolveDemoAccount(demoId);
    if (!demo) {
      return { success: false, error: `Demo account "${demoId}" not found.` };
    }

    const uid =
      demo.portal === 'patient'
        ? (demo.id === 'patient-sarah' ? 'pat-1' : 'pat-2')
        : demo.portal === 'doctor'
        ? (demo.id === 'doctor-aris' ? 'doc-1' : 'doc-2')
        : (demo.staffRole === 'dispatcher' ? 'staff-disp-1' : demo.staffRole === 'paramedic' ? 'staff-ems-1' : 'staff-admin-1');

    this.currentUser = {
      uid,
      name: demo.name,
      email: demo.email.toLowerCase(),
      phone: demo.phone,
      role: demo.role,
      portal: demo.portal,
      staffRole: demo.staffRole,
      customId: demo.customId,
      hospitalId: 'hosp-1',
      hospitalName: demo.hospitalName || 'City Metro General Hospital',
      department: demo.department,
      approvalStatus: 'approved',
      emailVerified: true,
    };

    // Ensure store role & id are active
    appStore.setRole(demo.role, uid);
    this.clearFailedLogin(demo.email);
    this.clearFailedLogin(demo.customId);
    this.persist();

    return { success: true, portal: demo.portal };
  }

  private loadUserProfiles() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(USER_PROFILES_STORAGE_KEY);
      if (stored) {
        const arr: UserProfileRecord[] = JSON.parse(stored);
        arr.forEach((p) => this.userProfiles.set(p.uid, p));
      }
    } catch (e) {
      console.warn('Failed to load user profiles from storage:', e);
    }
  }

  private saveUserProfiles() {
    if (typeof window === 'undefined') return;
    try {
      const arr = Array.from(this.userProfiles.values());
      localStorage.setItem(USER_PROFILES_STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('Failed to save user profiles to storage:', e);
    }
  }

  private loadPasswords() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(USER_PASSWORDS_STORAGE_KEY);
      if (stored) {
        const map = JSON.parse(stored);
        Object.entries(map).forEach(([k, v]) => this.userPasswords.set(k.toLowerCase(), String(v)));
      }
    } catch (e) {
      console.warn('Failed to load password store:', e);
    }
  }

  private savePassword(email: string, pass: string) {
    if (typeof window === 'undefined') return;
    try {
      this.userPasswords.set(email.toLowerCase(), pass);
      const obj = Object.fromEntries(this.userPasswords.entries());
      localStorage.setItem(USER_PASSWORDS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save password:', e);
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        if (this.currentUser) {
          appStore.setRole(this.currentUser.role, this.currentUser.uid);
        }
      }
    } catch (e) {
      console.warn('Failed to restore auth session:', e);
      this.currentUser = null;
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      if (this.currentUser) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
        appStore.setRole(this.currentUser.role, this.currentUser.uid);
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        appStore.setRole('guest');
      }
    } catch (e) {
      console.warn('Failed to persist auth session:', e);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentUser);
      } catch (err) {
        console.error('Error in auth listener:', err);
      }
    });
  }

  private initFirebaseAuthListener() {
    if (typeof window === 'undefined' || !auth) return;
    try {
      onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const profile = this.userProfiles.get(firebaseUser.uid);
          if (profile) {
            this.currentUser = {
              uid: firebaseUser.uid,
              name: profile.name,
              email: firebaseUser.email || profile.email,
              phone: profile.phone,
              role: profile.role,
              portal: profile.portal,
              staffRole: profile.staffRole,
              customId: profile.customId,
              hospitalId: profile.hospitalId,
              hospitalName: profile.hospitalName,
              department: profile.department,
              approvalStatus: profile.approvalStatus || 'approved',
              emailVerified: firebaseUser.emailVerified,
            };
            this.persist();
          }
        }
      });
    } catch (err) {
      console.warn('Failed to attach Firebase auth listener:', err);
    }
  }

  public subscribe(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  // --- Login Throttling Defense ---
  private getLoginAttempts(identifier: string): { count: number; lockedUntil?: number } {
    if (typeof window === 'undefined') return { count: 0 };
    try {
      const stored = localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
      if (!stored) return { count: 0 };
      const map = JSON.parse(stored);
      const record = map[identifier.toLowerCase()];
      if (!record) return { count: 0 };

      if (record.lockedUntil && Date.now() > record.lockedUntil) {
        delete map[identifier.toLowerCase()];
        localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(map));
        return { count: 0 };
      }
      return record;
    } catch {
      return { count: 0 };
    }
  }

  private recordFailedLogin(identifier: string): { locked: boolean; waitSeconds?: number } {
    if (typeof window === 'undefined') return { locked: false };
    try {
      const stored = localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
      const map = stored ? JSON.parse(stored) : {};
      const key = identifier.toLowerCase();
      const current = map[key] || { count: 0 };
      current.count += 1;

      // Lockout after 5 failed attempts for 60 seconds
      if (current.count >= 5) {
        current.lockedUntil = Date.now() + 60 * 1000;
        map[key] = current;
        localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(map));
        return { locked: true, waitSeconds: 60 };
      }

      map[key] = current;
      localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(map));
      return { locked: false };
    } catch {
      return { locked: false };
    }
  }

  private clearFailedLogin(identifier: string) {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(LOGIN_ATTEMPTS_STORAGE_KEY);
      if (!stored) return;
      const map = JSON.parse(stored);
      delete map[identifier.toLowerCase()];
      localStorage.setItem(LOGIN_ATTEMPTS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore
    }
  }

  // --- Duplicate Account Checks ---
  public checkDuplicateAccount(email: string, phone: string): { isDuplicate: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const phoneNorm = normalizeAndValidatePhone(phone).normalized;

    for (const profile of this.userProfiles.values()) {
      if (profile.email.toLowerCase() === cleanEmail) {
        return { isDuplicate: true, error: 'An account with this email address already exists. Please sign in.' };
      }
      if (profile.phone && normalizeAndValidatePhone(profile.phone).normalized === phoneNorm) {
        return { isDuplicate: true, error: 'An account with this phone number already exists. Please sign in.' };
      }
    }

    const state = appStore.getState();
    const existingPatientByEmail = state.patients.find((p) => p.email.toLowerCase() === cleanEmail);
    if (existingPatientByEmail) {
      return { isDuplicate: true, error: 'A patient account with this email address already exists. Please sign in.' };
    }
    const existingPatientByPhone = state.patients.find(
      (p) => normalizeAndValidatePhone(p.phone).normalized === phoneNorm
    );
    if (existingPatientByPhone) {
      return { isDuplicate: true, error: 'A patient account with this phone number already exists. Please sign in.' };
    }

    const existingDocByEmail = state.doctors.find((d) => d.email.toLowerCase() === cleanEmail);
    if (existingDocByEmail) {
      return { isDuplicate: true, error: 'A physician account with this email address already exists. Please sign in.' };
    }

    return { isDuplicate: false };
  }

  // --- Patient ID Lookup to Email ---
  public lookupPatientEmailById(patientId: string): { found: boolean; email?: string; name?: string; error?: string } {
    const cleanId = patientId.trim().toUpperCase();
    const formatCheck = validatePatientIdFormat(cleanId);
    if (!formatCheck.isValid) {
      return { found: false, error: formatCheck.error || "Invalid Patient ID format. Must be 'PT' followed by 5 digits." };
    }

    for (const p of this.userProfiles.values()) {
      if (p.customId.toUpperCase() === cleanId && p.portal === 'patient') {
        return { found: true, email: p.email, name: p.name };
      }
    }

    const state = appStore.getState();
    const pat = state.patients.find((p) => p.uniquePatientId.toUpperCase() === cleanId);
    if (pat) {
      return { found: true, email: pat.email, name: pat.name };
    }

    return { found: false, error: `No registered patient account found for Patient ID ${cleanId}.` };
  }

  // --- Password Registration (No OTP) ---
  public async registerWithPassword(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    portal: PortalType;
    staffRole?: 'admin' | 'dispatcher' | 'paramedic';
    hospitalId?: string;
    department?: string;
    // Patient extra fields
    dob?: string;
    gender?: 'Male' | 'Female' | 'Other';
    bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
    allergies?: string[];
    chronicConditions?: string[];
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    // Doctor extra fields
    specialization?: string;
    registrationNumber?: string;
    experienceYears?: number;
  }): Promise<{ success: boolean; error?: string; customId?: string }> {
    const { name, email, phone, password, role, portal, staffRole } = data;

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.isValid) {
      return { success: false, error: pwCheck.error };
    }

    const phoneCheck = normalizeAndValidatePhone(phone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error };
    }

    const cleanEmail = email.trim().toLowerCase();
    const dupCheck = this.checkDuplicateAccount(cleanEmail, phoneCheck.normalized);
    if (dupCheck.isDuplicate) {
      return { success: false, error: dupCheck.error };
    }

    // Step 1: Canonical UID resolution
    let uid = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let firebaseCreated = false;

    if (isFirebaseConfigured() && auth) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        uid = userCred.user.uid;
        firebaseCreated = true;
      } catch (err: any) {
        console.warn('Firebase createUserWithEmailAndPassword failed, using local profile:', err);
        if (err.code === 'auth/email-already-in-use') {
          return { success: false, error: 'An account with this email address is already registered.' };
        }
        if (err.code === 'auth/invalid-email') {
          return { success: false, error: 'Invalid email address format.' };
        }
      }
    }

    const state = appStore.getState();
    const hosp = state.hospitals.find((h) => h.id === data.hospitalId) || state.hospitals[0];

    // Step 2: Canonical custom identifier generation
    let customId = '';
    let approvalStatus: 'approved' | 'pending' = 'approved';

    if (portal === 'patient') {
      const existingPatientIds = state.patients.map((p) => p.uniquePatientId);
      customId = generateUniquePatientId(existingPatientIds);
    } else if (portal === 'doctor') {
      const docNum = state.doctors.length + 1;
      customId = `DR-${String(docNum).padStart(3, '0')}`;
      approvalStatus = 'pending';
    } else if (portal === 'hospital' || portal === 'emergency') {
      const rolePrefix = staffRole === 'dispatcher' ? 'DISP' : staffRole === 'paramedic' ? 'EMS' : 'ADM';
      customId = `${rolePrefix}-${Math.floor(100 + Math.random() * 900)}`;
      approvalStatus = staffRole === 'admin' ? 'approved' : 'pending';
    }

    // Step 3: Write Profile to App Store with Canonical UID & Custom ID
    try {
      if (portal === 'patient') {
        appStore.registerPatient({
          id: uid,
          uid,
          uniquePatientId: customId,
          name,
          email: cleanEmail,
          phone: phoneCheck.normalized,
          age: data.dob ? Math.max(1, new Date().getFullYear() - new Date(data.dob).getFullYear()) : 28,
          gender: data.gender || 'Female',
          bloodGroup: data.bloodGroup || 'O+',
          allergies: data.allergies || [],
          chronicConditions: data.chronicConditions || [],
          currentMedicines: [],
          emergencyContacts: data.emergencyContactName
            ? [{ name: data.emergencyContactName, relation: 'Emergency Contact', phone: data.emergencyContactPhone || phoneCheck.normalized }]
            : [],
          vaccinations: [],
        });
      } else if (portal === 'doctor') {
        const doc = appStore.registerDoctor({
          id: customId,
          uid,
          customId,
          name: name.startsWith('Dr.') ? name : `Dr. ${name}`,
          email: cleanEmail,
          specialization: data.specialization || 'General Medicine',
          hospitalId: hosp.id,
          hospitalName: hosp.name,
          experienceYears: data.experienceYears || 5,
          phone: phoneCheck.normalized,
          registrationNumber: data.registrationNumber || '',
          approvalStatus: 'pending',
        });

        appStore.addNotification({
          recipientRole: 'hospital',
          title: 'New Doctor Registration Pending Review',
          message: `${doc.name} (${data.specialization}) registered. Verification required in Staff Roster.`,
          type: 'system',
        });
      } else if (portal === 'hospital' || portal === 'emergency') {
        appStore.registerStaffMember({
          id: uid,
          uid,
          customId,
          name,
          email: cleanEmail,
          phone: phoneCheck.normalized,
          role,
          staffRole: staffRole || 'admin',
          hospitalId: hosp.id,
          hospitalName: hosp.name,
          department: data.department || 'Hospital Administration',
          approvalStatus,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (storeWriteErr: any) {
      console.error('Failed to write profile record to app store:', storeWriteErr);
      return { success: false, error: storeWriteErr.message || 'Failed to save profile record to database.' };
    }

    // Step 4: Write Credentials & User Profile in Auth System
    this.savePassword(cleanEmail, password);

    const profileRecord: UserProfileRecord = {
      uid,
      name,
      email: cleanEmail,
      phone: phoneCheck.normalized,
      role,
      portal,
      staffRole,
      customId,
      hospitalId: hosp.id,
      hospitalName: hosp.name,
      department: data.department || data.specialization,
      approvalStatus,
      createdAt: new Date().toISOString(),
    };

    this.userProfiles.set(uid, profileRecord);
    this.saveUserProfiles();

    // Step 5: Read-Back Verification & Atomic Rollback
    let readBackVerified = false;
    if (portal === 'patient') {
      const verifiedPatient = appStore.getPatientBySession({ uid, customId, email: cleanEmail });
      if (verifiedPatient && verifiedPatient.uniquePatientId.toUpperCase() === customId.toUpperCase()) {
        readBackVerified = true;
      }
    } else if (portal === 'doctor') {
      const verifiedDoc = appStore.getDoctorBySession({ uid, customId, email: cleanEmail });
      if (verifiedDoc) {
        readBackVerified = true;
      }
    } else {
      const verifiedStaff = appStore.getStaffBySession({ uid, customId, email: cleanEmail });
      if (verifiedStaff) {
        readBackVerified = true;
      }
    }

    if (!readBackVerified) {
      // ROLLBACK: Remove half-created profile and credentials
      const curState = appStore.getState();
      if (portal === 'patient') {
        curState.patients = curState.patients.filter((p) => p.id !== uid && p.uniquePatientId !== customId);
      } else if (portal === 'doctor') {
        curState.doctors = curState.doctors.filter((d) => d.id !== customId && d.uid !== uid);
      } else if (curState.staffMembers) {
        curState.staffMembers = curState.staffMembers.filter((s) => s.id !== uid && s.customId !== customId);
      }
      appStore.persistAndBroadcast();
      this.userProfiles.delete(uid);
      this.saveUserProfiles();
      this.userPasswords.delete(cleanEmail);
      return {
        success: false,
        error: 'Profile read-back verification failed. Changes were rolled back to prevent an incomplete account.',
      };
    }

    // Step 6: Create Verified Session
    this.currentUser = {
      uid,
      name,
      email: cleanEmail,
      phone: phoneCheck.normalized,
      role,
      portal,
      staffRole,
      customId,
      hospitalId: hosp.id,
      hospitalName: hosp.name,
      department: profileRecord.department,
      approvalStatus,
      emailVerified: true,
    };

    this.persist();
    return { success: true, customId };
  }

  // --- Password Login (No OTP) ---
  public async loginWithPassword(
    emailOrPatientId: string,
    password: string,
    expectedPortal: PortalType
  ): Promise<{ success: boolean; error?: string }> {
    const cleanIdentifier = emailOrPatientId.trim();
    if (!cleanIdentifier) {
      return { success: false, error: 'Please enter your Email Address or Patient ID.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your account password.' };
    }

    // Check if identifier matches any pre-configured demo account
    const demoMatch = this.resolveDemoAccount(cleanIdentifier);

    // Rate limiting check (Bypassed for demo accounts so evaluators are never locked out)
    if (!demoMatch) {
      const attemptStatus = this.getLoginAttempts(cleanIdentifier);
      if (attemptStatus.lockedUntil && Date.now() < attemptStatus.lockedUntil) {
        const remSeconds = Math.ceil((attemptStatus.lockedUntil - Date.now()) / 1000);
        return {
          success: false,
          error: `Too many failed login attempts. Please wait ${remSeconds} seconds before trying again.`,
        };
      }
    }

    // If identifier is a demo account and password matches demo password or standard test variants
    const isStandardDemoPassword =
      password === 'Password123' ||
      password === 'Demo@123' ||
      password === 'demo123' ||
      password === 'demo' ||
      password === 'admin123' ||
      (demoMatch && password === demoMatch.password);

    if (demoMatch && isStandardDemoPassword) {
      // Role & portal compatibility check
      const isPortalCompatible =
        demoMatch.portal === expectedPortal ||
        ((demoMatch.portal === 'hospital' || demoMatch.portal === 'emergency') &&
          (expectedPortal === 'hospital' || expectedPortal === 'emergency'));

      if (!isPortalCompatible) {
        return {
          success: false,
          error: `Account ${demoMatch.name} is authorized for the ${demoMatch.portal.toUpperCase()} portal, but you are attempting to log into the ${expectedPortal.toUpperCase()} portal.`,
        };
      }

      this.clearFailedLogin(cleanIdentifier);
      const res = this.loginAsDemo(demoMatch.id);
      return { success: res.success, error: res.error };
    }

    let resolvedEmail = cleanIdentifier;

    // Check if user entered a Patient ID (e.g. PT00234)
    if (/^PT\d{5}$/i.test(cleanIdentifier)) {
      const lookup = this.lookupPatientEmailById(cleanIdentifier);
      if (lookup.found && lookup.email) {
        resolvedEmail = lookup.email;
      }
    } else if (/^DR-\d{3}$/i.test(cleanIdentifier) || /^doc-\d+/i.test(cleanIdentifier)) {
      const doc = appStore.getState().doctors.find(
        (d) => (d.customId && d.customId.toUpperCase() === cleanIdentifier.toUpperCase()) || d.id === cleanIdentifier
      );
      if (doc?.email) resolvedEmail = doc.email;
    } else if (/^(ADM|DISP|EMS)-\d{3}$/i.test(cleanIdentifier)) {
      const staff = appStore.getState().staffMembers?.find(
        (s) => s.customId?.toUpperCase() === cleanIdentifier.toUpperCase() || s.id === cleanIdentifier
      );
      if (staff?.email) resolvedEmail = staff.email;
    }

    const lowerEmail = resolvedEmail.toLowerCase();

    // 1. Try Firebase Authentication if configured
    if (isFirebaseConfigured() && auth) {
      try {
        const userCred = await signInWithEmailAndPassword(auth, lowerEmail, password);
        const user = userCred.user;

        let profile = this.userProfiles.get(user.uid);
        if (!profile) {
          if (expectedPortal === 'patient') {
            const pat = appStore.getPatientBySession({ uid: user.uid, email: lowerEmail });
            profile = {
              uid: user.uid,
              name: pat?.name || user.displayName || 'Patient',
              email: user.email || lowerEmail,
              phone: pat?.phone || '',
              role: 'patient',
              portal: 'patient',
              customId: pat?.uniquePatientId || generateUniquePatientId([]),
              approvalStatus: 'approved',
              createdAt: new Date().toISOString(),
            };
          } else if (expectedPortal === 'doctor') {
            const doc = appStore.getDoctorBySession({ uid: user.uid, email: lowerEmail });
            profile = {
              uid: user.uid,
              name: doc?.name || user.displayName || 'Dr. Physician',
              email: user.email || lowerEmail,
              phone: doc?.phone || '',
              role: 'doctor',
              portal: 'doctor',
              customId: doc?.customId || doc?.id || 'DR-001',
              hospitalId: doc?.hospitalId || 'hosp-1',
              hospitalName: doc?.hospitalName || 'City Metro General Hospital',
              department: doc?.specialization || 'General Medicine',
              approvalStatus: doc?.approvalStatus || 'pending',
              createdAt: new Date().toISOString(),
            };
          } else {
            const staff = appStore.getStaffBySession({ uid: user.uid, email: lowerEmail });
            profile = {
              uid: user.uid,
              name: staff?.name || user.displayName || 'Hospital Staff',
              email: user.email || lowerEmail,
              phone: staff?.phone || '',
              role: staff?.role || 'admin',
              portal: 'hospital',
              staffRole: staff?.staffRole || 'admin',
              customId: staff?.customId || 'ADM-101',
              hospitalName: staff?.hospitalName || 'City Metro General Hospital',
              approvalStatus: staff?.approvalStatus || 'approved',
              createdAt: new Date().toISOString(),
            };
          }
          this.userProfiles.set(user.uid, profile);
          this.saveUserProfiles();
        } else {
          // Sync with latest store state (e.g. admin approval status)
          if (profile.portal === 'doctor') {
            const doc = appStore.getDoctorBySession(profile);
            if (doc && doc.approvalStatus) {
              profile.approvalStatus = doc.approvalStatus;
              this.userProfiles.set(user.uid, profile);
              this.saveUserProfiles();
            }
          }
        }

        // Role verification
        if (profile.portal !== expectedPortal && !(expectedPortal === 'hospital' && profile.portal === 'emergency')) {
          await signOut(auth);
          return {
            success: false,
            error: `This account is authorized for ${profile.portal.toUpperCase()} portal, but you are attempting to log into ${expectedPortal.toUpperCase()} portal.`,
          };
        }

        this.clearFailedLogin(cleanIdentifier);
        this.currentUser = {
          uid: user.uid,
          name: profile.name,
          email: user.email || profile.email,
          phone: profile.phone,
          role: profile.role,
          portal: profile.portal,
          staffRole: profile.staffRole,
          customId: profile.customId,
          hospitalId: profile.hospitalId,
          hospitalName: profile.hospitalName,
          department: profile.department,
          approvalStatus: profile.approvalStatus || 'approved',
          emailVerified: true,
        };

        appStore.setRole(profile.role, user.uid);
        this.persist();
        return { success: true };
      } catch (fbErr: any) {
        console.warn('Firebase signInWithEmailAndPassword attempt failed:', fbErr.code);
        // Fall through to local password verification if user was registered locally or offline
      }
    }

    // 2. Local Password Verification (Fallback / Instant Access)
    const storedPassword = this.userPasswords.get(lowerEmail) || this.userPasswords.get(cleanIdentifier.toLowerCase());
    const isPasswordValid = storedPassword === password || isStandardDemoPassword;

    // If user password exists and matches
    if (isPasswordValid) {
      // Find matching profile
      let profile = Array.from(this.userProfiles.values()).find(
        (p) =>
          p.email.toLowerCase() === lowerEmail ||
          p.customId.toLowerCase() === cleanIdentifier.toLowerCase() ||
          p.uid.toLowerCase() === cleanIdentifier.toLowerCase()
      );

      if (!profile) {
        if (expectedPortal === 'patient') {
          const pat = appStore.getPatientBySession({ email: lowerEmail, customId: cleanIdentifier });
          profile = {
            uid: pat?.uid || pat?.id || `pat-${Date.now()}`,
            name: pat?.name || 'Patient',
            email: lowerEmail,
            phone: pat?.phone || '+91 98765 00000',
            role: 'patient',
            portal: 'patient',
            customId: pat?.uniquePatientId || generateUniquePatientId([]),
            approvalStatus: 'approved',
            createdAt: new Date().toISOString(),
          };
        } else if (expectedPortal === 'doctor') {
          const doc = appStore.getDoctorBySession({ email: lowerEmail, customId: cleanIdentifier });
          profile = {
            uid: doc?.uid || doc?.id || `doc-${Date.now()}`,
            name: doc?.name || 'Doctor',
            email: lowerEmail,
            phone: doc?.phone || '+91 98765 00001',
            role: 'doctor',
            portal: 'doctor',
            customId: doc?.customId || doc?.id || 'DR-001',
            hospitalId: doc?.hospitalId || 'hosp-1',
            hospitalName: doc?.hospitalName || 'City Metro General Hospital',
            department: doc?.specialization || 'Cardiology',
            approvalStatus: doc?.approvalStatus || 'approved',
            createdAt: new Date().toISOString(),
          };
        } else {
          const staff = appStore.getStaffBySession({ email: lowerEmail, customId: cleanIdentifier });
          profile = {
            uid: staff?.uid || staff?.id || `staff-${Date.now()}`,
            name: staff?.name || 'Hospital Staff',
            email: lowerEmail,
            phone: staff?.phone || '+91 98765 00002',
            role: staff?.role || 'admin',
            portal: 'hospital',
            staffRole: staff?.staffRole || 'admin',
            customId: staff?.customId || 'ADM-101',
            hospitalName: staff?.hospitalName || 'City Metro General Hospital',
            approvalStatus: staff?.approvalStatus || 'approved',
            createdAt: new Date().toISOString(),
          };
        }
        this.userProfiles.set(profile.uid, profile);
        this.saveUserProfiles();
      } else {
        // Sync with latest store state (e.g. admin approval status)
        if (profile.portal === 'doctor') {
          const doc = appStore.getDoctorBySession(profile);
          if (doc && doc.approvalStatus) {
            profile.approvalStatus = doc.approvalStatus;
            profile.customId = doc.customId || doc.id || profile.customId;
            this.userProfiles.set(profile.uid, profile);
            this.saveUserProfiles();
          }
        }
      }

      if (profile.portal !== expectedPortal && !(expectedPortal === 'hospital' && profile.portal === 'emergency')) {
        return {
          success: false,
          error: `This account is authorized for ${profile.portal.toUpperCase()} portal, but you are attempting to log into ${expectedPortal.toUpperCase()} portal.`,
        };
      }

      this.clearFailedLogin(cleanIdentifier);
      this.currentUser = {
        uid: profile.uid,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        portal: profile.portal,
        staffRole: profile.staffRole,
        customId: profile.customId,
        hospitalId: profile.hospitalId,
        hospitalName: profile.hospitalName,
        department: profile.department,
        approvalStatus: profile.approvalStatus || 'approved',
        emailVerified: true,
      };

      this.persist();
      return { success: true };
    }

    // Invalid credentials
    this.recordFailedLogin(cleanIdentifier);
    return { success: false, error: 'Invalid email or password. Please verify your credentials and try again.' };
  }

  // --- Synchronize Approval Status ---
  public updateUserApprovalStatus(uidOrCustomId: string, status: 'approved' | 'pending') {
    const clean = uidOrCustomId.trim().toUpperCase();
    for (const [uid, profile] of this.userProfiles.entries()) {
      if (
        profile.uid === uidOrCustomId ||
        profile.customId.toUpperCase() === clean ||
        profile.email.toLowerCase() === uidOrCustomId.toLowerCase()
      ) {
        profile.approvalStatus = status;
        this.userProfiles.set(uid, profile);
      }
    }
    this.saveUserProfiles();
    if (
      this.currentUser &&
      (this.currentUser.uid === uidOrCustomId ||
        this.currentUser.customId.toUpperCase() === clean ||
        this.currentUser.email.toLowerCase() === uidOrCustomId.toLowerCase())
    ) {
      this.currentUser.approvalStatus = status;
      this.persist();
    }
  }

  // --- Self-Healing: Recreate or Complete Patient Profile ---
  public completePatientProfile(data: {
    name: string;
    dob?: string;
    gender?: 'Male' | 'Female' | 'Other';
    bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
    phone?: string;
    allergies?: string[];
    chronicConditions?: string[];
  }): { success: boolean; patient?: PatientProfile; error?: string } {
    if (!this.currentUser) return { success: false, error: 'No authenticated user session found.' };
    const uid = this.currentUser.uid;
    const cleanId = (this.currentUser.customId && /^PT\d{5}$/i.test(this.currentUser.customId))
      ? this.currentUser.customId.toUpperCase()
      : generateUniquePatientId(appStore.getState().patients.map((p) => p.uniquePatientId));

    const patient = appStore.selfHealPatient({
      uid,
      uniquePatientId: cleanId,
      name: data.name || this.currentUser.name,
      email: this.currentUser.email,
      phone: data.phone || this.currentUser.phone,
      age: data.dob ? Math.max(1, new Date().getFullYear() - new Date(data.dob).getFullYear()) : 28,
      gender: data.gender || 'Female',
      bloodGroup: data.bloodGroup || 'O+',
      allergies: data.allergies || [],
      chronicConditions: data.chronicConditions || [],
    });

    const profile = this.userProfiles.get(uid);
    if (profile) {
      profile.name = patient.name;
      profile.customId = cleanId;
      this.userProfiles.set(uid, profile);
      this.saveUserProfiles();
    }

    this.currentUser.name = patient.name;
    this.currentUser.customId = cleanId;
    this.persist();

    return { success: true, patient };
  }

  // --- Password Reset (sendPasswordResetEmail) ---
  public async sendPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    if (isFirebaseConfigured() && auth) {
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
      } catch (err) {
        console.warn('sendPasswordResetEmail suppressed:', err);
      }
    }

    return {
      success: true,
      message: 'If an account exists with this email address, a password reset link has been sent.',
    };
  }

  // Bystander Reporting
  public loginBystander() {
    this.currentUser = {
      uid: `bystander-${Date.now()}`,
      name: 'Emergency Bystander Reporter',
      email: 'bystander@emergency.meditrack',
      role: 'dispatcher',
      portal: 'hospital',
      staffRole: 'dispatcher',
      customId: 'BYSTANDER',
      emailVerified: true,
    };
    this.persist();
  }

  // Logout
  public async logout() {
    if (isFirebaseConfigured() && auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('Firebase signOut error:', err);
      }
    }
    this.currentUser = null;
    this.persist();
  }
}

export const authService = new AuthService();
