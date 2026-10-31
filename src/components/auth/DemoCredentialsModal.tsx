import React, { useState } from 'react';
import {
  X,
  Key,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  User,
  Stethoscope,
  Building2,
  Radio,
  Ambulance,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { DEMO_ACCOUNTS, DemoAccount, PortalType } from '../../services/auth';

interface DemoCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDemoAccount: (demoId: string) => void;
  onFillCredentials?: (identifier: string, password: string, portal: PortalType, staffRole?: 'admin' | 'dispatcher' | 'paramedic') => void;
  currentPortal?: PortalType;
}

export const DemoCredentialsModal: React.FC<DemoCredentialsModalProps> = ({
  isOpen,
  onClose,
  onSelectDemoAccount,
  onFillCredentials,
  currentPortal,
}) => {
  const [filterPortal, setFilterPortal] = useState<'all' | PortalType | 'dispatcher' | 'paramedic'>(
    currentPortal || 'all'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  const filteredAccounts = DEMO_ACCOUNTS.filter((acc) => {
    if (filterPortal === 'all') return true;
    if (filterPortal === 'dispatcher') return acc.staffRole === 'dispatcher';
    if (filterPortal === 'paramedic') return acc.staffRole === 'paramedic';
    if (filterPortal === 'hospital') return acc.portal === 'hospital' && acc.staffRole === 'admin';
    return acc.portal === filterPortal;
  });

  const getRoleIcon = (acc: DemoAccount) => {
    if (acc.portal === 'patient') return User;
    if (acc.portal === 'doctor') return Stethoscope;
    if (acc.staffRole === 'dispatcher') return Radio;
    if (acc.staffRole === 'paramedic') return Ambulance;
    return Building2;
  };

  const getRoleBadgeColor = (acc: DemoAccount) => {
    if (acc.portal === 'patient') return 'bg-teal-50 text-teal-700 border-teal-200';
    if (acc.portal === 'doctor') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (acc.staffRole === 'dispatcher') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (acc.staffRole === 'paramedic') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-purple-50 text-purple-700 border-purple-200';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#0B1F2D] text-white p-5 sm:p-6 relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
                <Key className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Demo Credentials & Evaluator Guide
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    Live Testbed
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Ready-to-use institutional accounts pre-seeded with clinical records, live telemetry, and active appointments.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Notice Banner */}
          <div className="mt-4 p-3 rounded-xl bg-white/10 border border-white/10 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
              <span className="text-slate-200">
                Standard Demo Password for all accounts:
              </span>
              <code className="bg-teal-950/80 text-teal-300 font-mono font-bold px-2 py-0.5 rounded border border-teal-500/40 select-all">
                Password123
              </code>
            </div>
            <button
              onClick={() => handleCopy('Password123', 'global-pw')}
              className="text-[11px] text-teal-300 hover:text-teal-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {copiedId === 'global-pw' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Password</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Portal Filter Tabs */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          <span className="text-[11px] text-slate-500 uppercase font-bold mr-1 shrink-0">Filter:</span>
          {[
            { id: 'all', label: 'All Roles (7)' },
            { id: 'patient', label: 'Patients (2)' },
            { id: 'doctor', label: 'Doctors (2)' },
            { id: 'hospital', label: 'Hospital Admin (1)' },
            { id: 'dispatcher', label: 'Dispatcher (1)' },
            { id: 'paramedic', label: 'Paramedic (1)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterPortal(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer transition-all ${
                filterPortal === tab.id
                  ? 'bg-teal-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Account Cards List */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh] space-y-4 divide-y divide-slate-100">
          {filteredAccounts.map((acc) => {
            const Icon = getRoleIcon(acc);
            const badgeColor = getRoleBadgeColor(acc);

            return (
              <div key={acc.id} className="pt-4 first:pt-0 space-y-3">
                {/* Persona Header & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-slate-800" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{acc.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                          {acc.roleTitle}
                        </span>
                        {acc.customId && (
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {acc.customId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {acc.department} {acc.hospitalName ? `• ${acc.hospitalName}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* 1-Click Launch Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    {onFillCredentials && (
                      <button
                        onClick={() => {
                          onFillCredentials(acc.email, acc.password, acc.portal, acc.staffRole);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 font-semibold cursor-pointer transition-colors"
                        title="Auto-fill login fields on active page"
                      >
                        Auto-Fill
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onSelectDemoAccount(acc.id);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0E7C7B] hover:bg-[#0c6b6a] rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Instant 1-Click Sign In</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed">{acc.description}</p>

                {/* Credentials & Copy Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {/* Login ID / Email */}
                  <div className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                    <div className="truncate">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                        Login ID / Email
                      </span>
                      <span className="font-mono text-slate-800 font-semibold text-xs select-all">
                        {acc.email}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(acc.email, `id-${acc.id}`)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 cursor-pointer"
                      title="Copy Email / ID"
                    >
                      {copiedId === `id-${acc.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Password */}
                  <div className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">
                        Password
                      </span>
                      <span className="font-mono text-slate-800 font-semibold text-xs select-all">
                        {acc.password}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(acc.password, `pw-${acc.id}`)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 cursor-pointer"
                      title="Copy Password"
                    >
                      {copiedId === `pw-${acc.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Key Workflows to Evaluate */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Key Workflows Ready for Evaluation:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                    {acc.highlights.map((h, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All mock databases, queue tokens, and ambulance telemetry are actively reactive.</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold cursor-pointer transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
