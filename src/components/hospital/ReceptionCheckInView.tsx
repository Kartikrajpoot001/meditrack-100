import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  CreditCard,
  Printer,
  ShieldAlert,
  ArrowRight,
  Stethoscope,
  Building2,
  FileText,
  DollarSign,
  AlertCircle,
  Calendar,
  XCircle,
  Sparkles,
  Phone,
  Droplet,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { AppState, appStore, validatePatientIdFormat } from '../../services/store';
import { AppointmentRecord, PatientProfile, QueueToken } from '../../types';
import { AuthUser } from '../../services/auth';

interface ReceptionCheckInViewProps {
  appState: AppState;
  currentUser?: AuthUser | null;
  onNavigateToQueues?: () => void;
}

export const ReceptionCheckInView: React.FC<ReceptionCheckInViewProps> = ({
  appState,
  currentUser,
  onNavigateToQueues,
}) => {
  // Search input state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedPatient, setSearchedPatient] = useState<PatientProfile | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [searchError, setSearchError] = useState('');
  const [actionSuccessMessage, setActionSuccessMessage] = useState('');

  // Payment Collection State
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'UPI'>('Cash');
  const [paymentAmount, setPaymentAmount] = useState<number>(800);
  const [latestReceipt, setLatestReceipt] = useState<{
    receiptNumber: string;
    amount: number;
    method: 'Cash' | 'Card' | 'UPI';
    patientName: string;
    uniquePatientId: string;
    doctorName: string;
    staffId: string;
    timestamp: string;
  } | null>(null);

  // Issued Token Pass State
  const [issuedTokenPass, setIssuedTokenPass] = useState<{
    tokenNumber: string;
    patientName: string;
    uniquePatientId: string;
    doctorName: string;
    roomNumber: string;
    peopleAhead: number;
    estimatedWaitMinutes: number;
    timestamp: string;
  } | null>(null);

  // Configurable No-Show Timeout (minutes)
  const [noShowThresholdMinutes, setNoShowThresholdMinutes] = useState<number>(30);
  const [filterTodayTab, setFilterTodayTab] = useState<'all' | 'pending' | 'checked_in' | 'unpaid'>('all');

  // Active Receptionist Staff ID
  const staffId = currentUser?.customId || currentUser?.uid || 'ADM-101';
  const staffName = currentUser?.name || 'Vikram Joshi (Reception Desk)';
  const todayDateStr = appStore.getSimulatedDate(); // '2026-10-30'

  // Today's appointments across the hospital
  const todayAppointments = useMemo(() => {
    return (appState.appointments || []).filter((a) => a.date === todayDateStr);
  }, [appState.appointments, todayDateStr]);

  const allHospitalAppointments = useMemo(() => {
    return appState.appointments || [];
  }, [appState.appointments]);

  // Handle Search Submission
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearchError('');
    setActionSuccessMessage('');
    setLatestReceipt(null);
    setIssuedTokenPass(null);

    const q = searchQuery.trim().toUpperCase();
    if (!q) {
      setSearchError('Please enter a Patient ID (PT00000) or Appointment ID (APT-2026-XXXX)');
      setSearchedPatient(null);
      setSelectedAppointment(null);
      return;
    }

    // Check if user entered an Appointment ID (e.g. APT-2026-XXXX)
    if (q.startsWith('APT-')) {
      const apt = allHospitalAppointments.find((a) => a.id.toUpperCase() === q);
      if (!apt) {
        setSearchError(`No appointment found with ID "${q}".`);
        setSearchedPatient(null);
        setSelectedAppointment(null);
        return;
      }

      // Found appointment -> retrieve patient
      const pat =
        appState.patients.find(
          (p) => p.id === apt.patientId || p.uniquePatientId === apt.uniquePatientId
        ) || null;

      setSearchedPatient(pat);
      setSelectedAppointment(apt);
      setPaymentAmount(apt.fee || 800);
      return;
    }

    // If query starts with PT or is intended as Patient ID, strictly validate format
    if (q.startsWith('PT') || /^[A-Z0-9]+$/i.test(q)) {
      const formatCheck = validatePatientIdFormat(q);
      if (!formatCheck.isValid) {
        setSearchError(formatCheck.error || "Invalid Patient ID format. Must be 'PT' followed by 5 digits (e.g., PT00234)");
        setSearchedPatient(null);
        setSelectedAppointment(null);
        return;
      }

      // Check existence in registered patient database
      const pat = appStore.lookupPatientById(q);
      if (!pat) {
        setSearchError('No patient found with ID ' + q);
        setSearchedPatient(null);
        setSelectedAppointment(null);
        return;
      }

      setSearchedPatient(pat);

      // Find relevant appointments for this patient (prefer today's appointment first)
      const patientApts = allHospitalAppointments.filter(
        (a) => a.patientId === pat.id || a.uniquePatientId === pat.uniquePatientId
      );

      const todayApt = patientApts.find((a) => a.date === todayDateStr);
      const chosenApt = todayApt || patientApts[0] || null;

      setSelectedAppointment(chosenApt);
      if (chosenApt) {
        setPaymentAmount(chosenApt.fee || 800);
      }
      return;
    }

    setSearchError("Please enter a valid Patient ID (e.g., PT00234) or Appointment ID (e.g., APT-2026-0001)");
    setSearchedPatient(null);
    setSelectedAppointment(null);
  };

  // Quick select an appointment from today's ledger
  const handleSelectFromTable = (apt: AppointmentRecord) => {
    setSearchQuery(apt.uniquePatientId);
    setSearchError('');
    setActionSuccessMessage('');
    setLatestReceipt(null);
    setIssuedTokenPass(null);

    const pat =
      appState.patients.find(
        (p) => p.id === apt.patientId || p.uniquePatientId === apt.uniquePatientId
      ) || null;

    setSearchedPatient(pat);
    setSelectedAppointment(apt);
    setPaymentAmount(apt.fee || 800);
  };

  // 1. Collect pending payment at reception
  const handleCollectPayment = () => {
    if (!selectedAppointment) return;
    setSearchError('');
    setActionSuccessMessage('');

    try {
      const res = appStore.collectReceptionPayment({
        appointmentId: selectedAppointment.id,
        staffId,
        method: paymentMethod,
        amount: paymentAmount,
      });

      setSelectedAppointment({ ...res.appointment });
      setLatestReceipt({
        receiptNumber: res.receipt,
        amount: paymentAmount,
        method: paymentMethod,
        patientName: res.appointment.patientName,
        uniquePatientId: res.appointment.uniquePatientId,
        doctorName: res.appointment.doctorName,
        staffId,
        timestamp: new Date().toLocaleString(),
      });

      setActionSuccessMessage(
        `Payment of ₹${paymentAmount} collected via ${paymentMethod}. Receipt #${res.receipt} registered.`
      );
    } catch (err: any) {
      setSearchError(err.message || 'Failed to collect payment');
    }
  };

  // 2. Complete Check-in & Generate Token
  const handleCheckIn = () => {
    if (!selectedAppointment) return;
    setSearchError('');
    setActionSuccessMessage('');

    // Pre-validation checks
    if (selectedAppointment.appointmentStatus === 'Checked-in') {
      setSearchError(
        `Duplicate check-in blocked: Patient is already checked in with Token #${selectedAppointment.tokenNumber || 'Active'}.`
      );
      return;
    }

    if (selectedAppointment.appointmentStatus === 'Cancelled') {
      setSearchError('Cancelled appointments cannot be checked in.');
      return;
    }

    try {
      // If payment is still pending, bundle the payment collection into the check-in
      const paymentPayload =
        selectedAppointment.paymentStatus !== 'Paid'
          ? { method: paymentMethod, amount: paymentAmount }
          : undefined;

      const res = appStore.checkInAppointment({
        appointmentId: selectedAppointment.id,
        staffId,
        paymentCollection: paymentPayload,
      });

      setSelectedAppointment({ ...res.appointment });

      const doctor = appState.doctors.find((d) => d.id === res.appointment.doctorId);
      const peopleAhead = appStore.getState().queueTokens.filter(
        (q) =>
          q.doctorId === res.appointment.doctorId &&
          (q.status === 'waiting' || q.status === 'in_consultation') &&
          q.id !== res.token.id
      ).length;

      const waitMins = peopleAhead * (doctor?.avgConsultationTimeMinutes || 10);

      setIssuedTokenPass({
        tokenNumber: res.token.tokenNumber,
        patientName: res.appointment.patientName,
        uniquePatientId: res.appointment.uniquePatientId,
        doctorName: res.appointment.doctorName,
        roomNumber: doctor?.roomNumber || 'Cabin 1',
        peopleAhead,
        estimatedWaitMinutes: waitMins,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      if (res.receipt) {
        setLatestReceipt({
          receiptNumber: res.receipt,
          amount: paymentAmount,
          method: paymentMethod,
          patientName: res.appointment.patientName,
          uniquePatientId: res.appointment.uniquePatientId,
          doctorName: res.appointment.doctorName,
          staffId,
          timestamp: new Date().toLocaleString(),
        });
      }

      setActionSuccessMessage(
        `Successfully checked in! Token ${res.token.tokenNumber} generated. Patient notified to proceed to ${doctor?.roomNumber || 'Cabin'}.`
      );
    } catch (err: any) {
      setSearchError(err.message || 'Check-in failed');
    }
  };

  // 3. Mark appointment as No-show
  const handleMarkNoShow = () => {
    if (!selectedAppointment) return;
    if (
      !window.confirm(
        `Mark appointment ${selectedAppointment.id} (${selectedAppointment.patientName}) as No-Show?`
      )
    ) {
      return;
    }

    try {
      const updated = appStore.markAppointmentNoShow(selectedAppointment.id, staffId);
      setSelectedAppointment({ ...updated });
      setActionSuccessMessage(`Appointment marked as No-Show by reception.`);
    } catch (err: any) {
      setSearchError(err.message || 'Failed to update status');
    }
  };

  // Warnings computation for selected appointment
  const isNotToday = selectedAppointment && selectedAppointment.date !== todayDateStr;
  const isCancelled = selectedAppointment && selectedAppointment.appointmentStatus === 'Cancelled';
  const isAlreadyCheckedIn =
    selectedAppointment &&
    (selectedAppointment.appointmentStatus === 'Checked-in' ||
      selectedAppointment.appointmentStatus === 'In consultation' ||
      selectedAppointment.appointmentStatus === 'Completed');
  const isNoShow = selectedAppointment && selectedAppointment.appointmentStatus === 'No-show';
  const isPaymentPending = selectedAppointment && selectedAppointment.paymentStatus !== 'Paid';

  // Filtered Today's appointments list
  const filteredTodayList = todayAppointments.filter((a) => {
    if (filterTodayTab === 'pending') {
      return (
        a.appointmentStatus === 'Booked' ||
        a.appointmentStatus === 'Confirmed' ||
        a.appointmentStatus === 'Confirmed - Payment Pending'
      );
    }
    if (filterTodayTab === 'checked_in') {
      return a.appointmentStatus === 'Checked-in' || a.appointmentStatus === 'In consultation';
    }
    if (filterTodayTab === 'unpaid') {
      return a.paymentStatus !== 'Paid';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Desk Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E3E8EB]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Hospital Reception & Patient Check-in Desk
            </h1>
            <span className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
              Live OPD Desk
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Receptionist: <strong className="text-slate-800">{staffName}</strong> (ID: {staffId}) • Scheduled Date:{' '}
            <strong className="text-slate-800">{todayDateStr}</strong>
          </p>
        </div>

        {/* Quick OPD Summary Counters */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-white border border-[#E3E8EB] rounded-lg text-xs">
            <span className="text-slate-500">Today Expected: </span>
            <span className="font-bold text-slate-900">{todayAppointments.length}</span>
          </div>
          <div className="px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-[#0E7C7B]">
            <span className="font-medium">Checked-in: </span>
            <span className="font-bold">
              {
                todayAppointments.filter(
                  (a) => a.appointmentStatus === 'Checked-in' || a.appointmentStatus === 'In consultation'
                ).length
              }
            </span>
          </div>
          {onNavigateToQueues && (
            <button
              onClick={onNavigateToQueues}
              className="px-3 py-1.5 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Live Doctor Queues</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Search, Verification, Payment, Token Issuance */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Reception Search Card */}
          <div className="bg-white rounded-lg border border-[#E3E8EB] p-5 shadow-sm">
            <div className="pb-3 border-b border-[#E3E8EB]">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Search className="w-4 h-4 text-[#0E7C7B]" />
                <span>Patient & Appointment Intake Lookup</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Search by Unique Patient ID (<code className="font-mono text-[#0E7C7B]">PT00234</code>) or Appointment ID (<code className="font-mono text-[#0E7C7B]">APT-2026-0001</code>).
              </p>
            </div>

            <form onSubmit={handleSearch} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchError) setSearchError('');
                  }}
                  placeholder="Enter PT-ID (e.g. PT00234) or APT-ID (e.g. APT-2026-0004)"
                  className="w-full bg-[#F4F7F8] border border-[#E3E8EB] rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Search Record
              </button>
            </form>

            {/* Error Message Banner */}
            {searchError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-[#D32F2F] text-xs p-3 rounded-lg font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#D32F2F] shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {/* Success Message Banner */}
            {actionSuccessMessage && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccessMessage}</span>
              </div>
            )}

            {/* Quick Demo Search Chips */}
            <div className="mt-3 pt-3 border-t border-[#E3E8EB] flex items-center flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="font-semibold">Quick Lookup:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('PT00234');
                  setTimeout(() => {
                    const pat = appStore.lookupPatientById('PT00234');
                    const apt = allHospitalAppointments.find((a) => a.uniquePatientId === 'PT00234');
                    setSearchedPatient(pat);
                    setSelectedAppointment(apt || null);
                    if (apt) setPaymentAmount(apt.fee || 800);
                  }, 50);
                }}
                className="font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-[#E3E8EB] cursor-pointer"
              >
                PT00234 (Sarah Chen - Checked-in)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('PT51829');
                  setTimeout(() => {
                    const pat = appStore.lookupPatientById('PT51829');
                    const apt = allHospitalAppointments.find((a) => a.uniquePatientId === 'PT51829');
                    setSearchedPatient(pat);
                    setSelectedAppointment(apt || null);
                    if (apt) setPaymentAmount(apt.fee || 800);
                  }, 50);
                }}
                className="font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-[#E3E8EB] cursor-pointer"
              >
                PT51829 (Priya Nair - Booked)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('PT40291');
                  setTimeout(() => {
                    const pat = appStore.lookupPatientById('PT40291');
                    const apt = allHospitalAppointments.find((a) => a.uniquePatientId === 'PT40291');
                    setSearchedPatient(pat);
                    setSelectedAppointment(apt || null);
                    if (apt) setPaymentAmount(apt.fee || 650);
                  }, 50);
                }}
                className="font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-[#E3E8EB] cursor-pointer"
              >
                PT40291 (Anita - Unpaid)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('PT99999');
                  setSearchedPatient(null);
                  setSelectedAppointment(null);
                  setSearchError('No patient found with ID PT99999');
                }}
                className="font-mono bg-red-50 hover:bg-red-100 text-[#D32F2F] px-2 py-0.5 rounded border border-red-200 cursor-pointer"
              >
                PT99999 (Nonexistent Test)
              </button>
            </div>
          </div>

          {/* 2. Patient Identity & Appointment Verification Card */}
          {searchedPatient && (
            <div className="bg-white rounded-lg border border-[#E3E8EB] p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E3E8EB]">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{searchedPatient.name}</h2>
                    <span className="font-mono text-xs font-bold bg-teal-50 text-[#0E7C7B] border border-teal-200 px-2 py-0.5 rounded">
                      {searchedPatient.uniquePatientId}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ({searchedPatient.age} yrs • {searchedPatient.gender})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>Phone: <strong className="text-slate-800">{searchedPatient.phone}</strong></span>
                    <span>•</span>
                    <span>Blood: <strong className="text-slate-800">{searchedPatient.bloodGroup}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Identity Verified</span>
                  </span>
                </div>
              </div>

              {/* Allergy Warning if present */}
              {searchedPatient.allergies.length > 0 && (
                <div className="bg-red-50 border border-[#D32F2F] rounded-lg p-2.5 text-xs flex items-center gap-2 text-[#D32F2F] font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Allergies: {searchedPatient.allergies.join(', ')}</span>
                </div>
              )}

              {/* Appointment Details & Verification Warnings */}
              {selectedAppointment ? (
                <div className="space-y-4 pt-1">
                  {/* Warning 1: Date is not today */}
                  {isNotToday && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Date Warning: Appointment is NOT today</div>
                        <div>
                          This appointment is scheduled for{' '}
                          <strong className="underline">{selectedAppointment.date}</strong> (Today is{' '}
                          {todayDateStr}). Please verify with patient before proceeding with early check-in.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warning 2: Appointment is Cancelled */}
                  {isCancelled && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-[#D32F2F] flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-[#D32F2F] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Appointment Cancelled</div>
                        <div>
                          This appointment was cancelled ({selectedAppointment.cancelReason || 'Patient cancelled'}). Check-in cannot be completed.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warning 3: Already Checked-in / Duplicate Check-in */}
                  {isAlreadyCheckedIn && (
                    <div className="bg-teal-50 border border-teal-300 rounded-lg p-3 text-xs text-teal-900 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-[#0E7C7B] shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Already Checked In (Duplicate Check-in Blocked)</div>
                        <div>
                          Patient was checked in at{' '}
                          <span className="font-mono font-semibold">
                            {selectedAppointment.checkedInAt
                              ? new Date(selectedAppointment.checkedInAt).toLocaleTimeString()
                              : 'earlier today'}
                          </span>
                          . Token Number:{' '}
                          <strong className="font-mono text-[#0E7C7B] text-sm">
                            #{selectedAppointment.tokenNumber || 'Active'}
                          </strong>
                          .
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Warning 4: No-Show */}
                  {isNoShow && (
                    <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Appointment Marked as No-Show</div>
                        <div>Patient failed to arrive within the scheduled window. Re-issuance required.</div>
                      </div>
                    </div>
                  )}

                  {/* Appointment Details Grid */}
                  <div className="p-3.5 rounded-lg bg-[#F4F7F8] border border-[#E3E8EB] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {selectedAppointment.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            selectedAppointment.appointmentStatus === 'Checked-in'
                              ? 'bg-teal-100 text-teal-800'
                              : selectedAppointment.appointmentStatus === 'Cancelled'
                              ? 'bg-red-100 text-[#D32F2F]'
                              : selectedAppointment.appointmentStatus === 'No-show'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {selectedAppointment.appointmentStatus}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">Payment:</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                            selectedAppointment.paymentStatus === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {selectedAppointment.paymentStatus}
                          {selectedAppointment.receptionPaymentMethod &&
                            ` (${selectedAppointment.receptionPaymentMethod})`}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Doctor</span>
                        <span className="font-bold text-slate-800">{selectedAppointment.doctorName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Department</span>
                        <span className="font-semibold text-slate-800">{selectedAppointment.department}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Slot Time</span>
                        <span className="font-semibold text-slate-800">
                          {selectedAppointment.date} • {selectedAppointment.timeSlot}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-medium">Consultation Fee</span>
                        <span className="font-bold text-slate-900">₹{selectedAppointment.fee}</span>
                      </div>
                    </div>

                    {/* Problem Summary & AI Specialty preview */}
                    {selectedAppointment.caseSummary && (
                      <div className="pt-2 border-t border-[#E3E8EB] text-xs">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                          Patient Case Summary & AI Specialty Suggestion:
                        </span>
                        <p className="text-slate-700 italic">"{selectedAppointment.caseSummary}"</p>
                        {selectedAppointment.aiSpecialtySuggestion && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-[#0E7C7B]">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Matched Specialty: <strong>{selectedAppointment.aiSpecialtySuggestion}</strong></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Pending Payment Collection Section */}
                  {isPaymentPending && !isCancelled && (
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-amber-700" />
                          <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                            Pending Payment Collection (Counter)
                          </h3>
                        </div>
                        <span className="text-xs font-bold text-slate-900">Due: ₹{selectedAppointment.fee}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Payment Method *
                          </label>
                          <div className="flex gap-2">
                            {(['Cash', 'Card', 'UPI'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setPaymentMethod(m)}
                                className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
                                  paymentMethod === m
                                    ? 'bg-[#0E7C7B] text-white border-[#0E7C7B]'
                                    : 'bg-white text-slate-700 border-[#E3E8EB] hover:bg-slate-50'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Amount Collected (INR) *
                          </label>
                          <input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                            className="w-full bg-white border border-[#E3E8EB] rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#0E7C7B] font-semibold"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCollectPayment}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Collect ₹{paymentAmount} & Mark as Paid (Generate Receipt)</span>
                      </button>
                    </div>
                  )}

                  {/* 4. Action Buttons: Check-in / Token / No-Show */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                    <button
                      type="button"
                      disabled={Boolean(isCancelled || isAlreadyCheckedIn)}
                      onClick={handleCheckIn}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                        isCancelled || isAlreadyCheckedIn
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-[#0E7C7B] hover:bg-[#0c6b6a] text-white shadow-sm cursor-pointer'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isAlreadyCheckedIn
                          ? 'Already Checked In'
                          : isPaymentPending
                          ? 'Collect Payment & Complete Check-in'
                          : 'Confirm Check-in & Issue Token'}
                      </span>
                    </button>

                    {!isCancelled && !isAlreadyCheckedIn && !isNoShow && (
                      <button
                        type="button"
                        onClick={handleMarkNoShow}
                        className="py-2.5 px-3 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-[#D32F2F] text-xs font-semibold rounded-lg border border-[#E3E8EB] transition-colors cursor-pointer"
                        title="Mark patient as No-Show if not arrived within timeout"
                      >
                        Mark No-Show
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#F4F7F8] border border-[#E3E8EB] text-center text-xs text-slate-500">
                  No appointments on record for this patient.
                </div>
              )}
            </div>
          )}

          {/* 3. Printed Receipt Card (when generated) */}
          {latestReceipt && (
            <div className="bg-white rounded-lg border-2 border-emerald-500 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E3E8EB]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Official Payment Receipt
                  </h3>
                </div>
                <button
                  onClick={() => window.print()}
                  className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Receipt No</span>
                  <span className="font-mono font-bold text-slate-900">{latestReceipt.receiptNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Amount Paid</span>
                  <span className="font-bold text-emerald-700">₹{latestReceipt.amount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Payment Mode</span>
                  <span className="font-semibold text-slate-800">{latestReceipt.method}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Staff Collector</span>
                  <span className="font-mono text-slate-700">{latestReceipt.staffId}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic pt-1">
                Received with thanks from {latestReceipt.patientName} ({latestReceipt.uniquePatientId}) for consultation with {latestReceipt.doctorName} on {latestReceipt.timestamp}.
              </p>
            </div>
          )}

          {/* 4. Issued Digital Token Pass (when checked in) */}
          {issuedTokenPass && (
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg border-2 border-[#0E7C7B] p-5 shadow-md space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-teal-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0E7C7B]" />
                  <h3 className="text-xs font-bold text-[#0E7C7B] uppercase tracking-wider">
                    Digital OPD Token Slip Issued
                  </h3>
                </div>
                <button
                  onClick={() => window.print()}
                  className="text-xs text-[#0E7C7B] hover:text-[#0c6b6a] flex items-center gap-1 font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500">Assigned Token Number</div>
                  <div className="text-3xl font-extrabold font-mono text-[#0E7C7B]">
                    {issuedTokenPass.tokenNumber}
                  </div>
                  <div className="text-xs text-slate-700 mt-1">
                    Patient: <strong>{issuedTokenPass.patientName}</strong> ({issuedTokenPass.uniquePatientId})
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Consultation Location</div>
                  <div className="text-lg font-bold text-slate-900">{issuedTokenPass.roomNumber}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{issuedTokenPass.doctorName}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-teal-200/60 flex items-center justify-between text-xs text-slate-700">
                <div>
                  Patients Ahead in Queue: <strong className="text-[#0E7C7B]">{issuedTokenPass.peopleAhead}</strong>
                </div>
                <div>
                  Est. Wait: <strong className="text-[#0E7C7B]">~{issuedTokenPass.estimatedWaitMinutes} mins</strong>
                </div>
              </div>

              <div className="bg-white/80 rounded p-2 text-[11px] text-slate-600 flex items-center gap-2 border border-teal-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  In-app notification sent to patient with token #{issuedTokenPass.tokenNumber} and cabin location.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Today's Schedule Ledger & Queue Overview */}
        <div className="lg:col-span-5 space-y-5">
          {/* Quick Filter Ledger Card */}
          <div className="bg-white rounded-lg border border-[#E3E8EB] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#E3E8EB] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Today's OPD Appointments</h2>
                <p className="text-xs text-slate-500">{todayAppointments.length} bookings scheduled today</p>
              </div>
              <div className="text-[11px] font-mono text-slate-500">{todayDateStr}</div>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-[#E3E8EB] bg-[#F4F7F8] text-[11px] font-medium">
              {[
                { id: 'all', label: 'All', count: todayAppointments.length },
                {
                  id: 'pending',
                  label: 'Pending',
                  count: todayAppointments.filter(
                    (a) =>
                      a.appointmentStatus === 'Booked' ||
                      a.appointmentStatus === 'Confirmed' ||
                      a.appointmentStatus === 'Confirmed - Payment Pending'
                  ).length,
                },
                {
                  id: 'checked_in',
                  label: 'Checked-in',
                  count: todayAppointments.filter(
                    (a) => a.appointmentStatus === 'Checked-in' || a.appointmentStatus === 'In consultation'
                  ).length,
                },
                {
                  id: 'unpaid',
                  label: 'Unpaid',
                  count: todayAppointments.filter((a) => a.paymentStatus !== 'Paid').length,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTodayTab(tab.id as any)}
                  className={`flex-1 py-2 text-center border-b-2 transition-colors ${
                    filterTodayTab === tab.id
                      ? 'border-[#0E7C7B] text-[#0E7C7B] bg-white font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Appointment Rows List */}
            <div className="divide-y divide-[#E3E8EB] max-h-[460px] overflow-y-auto">
              {filteredTodayList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No appointments matching this filter.
                </div>
              ) : (
                filteredTodayList.map((apt) => {
                  const isSelected = selectedAppointment?.id === apt.id;
                  const isCheckedIn = apt.appointmentStatus === 'Checked-in';

                  return (
                    <div
                      key={apt.id}
                      onClick={() => handleSelectFromTable(apt)}
                      className={`p-3 text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-teal-50/70 border-l-4 border-l-[#0E7C7B]'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{apt.patientName}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {apt.uniquePatientId}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {apt.doctorName} • <span className="font-medium text-slate-700">{apt.timeSlot}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              isCheckedIn
                                ? 'bg-teal-100 text-teal-800'
                                : apt.appointmentStatus === 'Cancelled'
                                ? 'bg-red-100 text-[#D32F2F]'
                                : apt.paymentStatus !== 'Paid'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isCheckedIn ? `Token ${apt.tokenNumber || 'Active'}` : apt.appointmentStatus}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 font-mono">
                            {apt.paymentStatus === 'Paid' ? 'Paid' : `Due ₹${apt.fee}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Privacy & Compliance Assurance Box */}
          <div className="bg-[#F4F7F8] rounded-lg border border-[#E3E8EB] p-4 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldAlert className="w-4 h-4 text-[#0E7C7B]" />
              <span>Data Protection & Privacy Notice</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Clinical descriptions, voice transcripts, and attached photos are confidential medical records, accessible only to the authenticated patient, the attending hospital reception, and the assigned specialist doctor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
