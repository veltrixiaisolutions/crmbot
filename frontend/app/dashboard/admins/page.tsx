"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { 
  Shield, 
  ShieldCheck, 
  UserPlus, 
  Users, 
  RefreshCw, 
  Pencil, 
  Trash2, 
  X, 
  Search, 
  Mail, 
  Lock, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles,
  KeyRound,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "../_components/CopyButton";

type AdminUser = {
  id: string;
  name?: string;
  email: string;
  role: "admin" | "staff";
  status?: string;
  created_at: string;
};

type CurrentUser = {
  id: string;
  name?: string;
  email: string;
  role: "admin" | "staff";
};

export default function AdminsManagementPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation State
  const [deleteConfirmAdmin, setDeleteConfirmAdmin] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAdmins = async () => {
    try {
      setRefreshing(true);
      const [adminsData, meData] = await Promise.all([
        api.get<AdminUser[]>("/users/admins"),
        api.get<CurrentUser>("/users/me").catch(() => null),
      ]);
      setAdmins(adminsData);
      if (meData) setCurrentUser(meData);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load admins:", err);
      setError(err.message || "Failed to load admin accounts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const openAddModal = () => {
    setEditingAdmin(null);
    setName("");
    setEmail("");
    setPassword("");
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setName(admin.name || "");
    setEmail(admin.email);
    setPassword("");
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);

    try {
      if (editingAdmin) {
        const payload: any = {
          name: name.trim() || null,
          email: email.trim(),
        };
        if (password.trim()) {
          payload.password = password.trim();
        }
        await api.patch<AdminUser>(`/users/admins/${editingAdmin.id}`, payload);
      } else {
        if (!password.trim()) {
          setModalError("Password is required for new administrators");
          setIsSaving(false);
          return;
        }
        await api.post<AdminUser>("/users/admins", {
          name: name.trim() || undefined,
          email: email.trim(),
          password: password.trim(),
        });
      }
      setIsModalOpen(false);
      fetchAdmins();
    } catch (err: any) {
      setModalError(err.message || "Failed to save administrator account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmAdmin) return;
    setIsDeleting(true);
    try {
      await api.del(`/users/admins/${deleteConfirmAdmin.id}`);
      setDeleteConfirmAdmin(null);
      fetchAdmins();
    } catch (err: any) {
      alert(err.message || "Failed to delete administrator account");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredAdmins = useMemo(() => {
    return admins.filter((a) => {
      const q = searchQuery.toLowerCase();
      const matchName = a.name ? a.name.toLowerCase().includes(q) : false;
      const matchEmail = a.email.toLowerCase().includes(q);
      return matchName || matchEmail;
    });
  }, [admins, searchQuery]);

  return (
    <div className="space-y-8 pb-12">
      {/* Team Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Link
          href="/dashboard/staff"
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
        >
          <Users className="h-4 w-4 text-slate-400" />
          <span>Staff Members</span>
        </Link>
        <Link
          href="/dashboard/admins"
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs"
        >
          <Shield className="h-4 w-4 text-indigo-400" />
          <span>Admin Accounts</span>
        </Link>
      </div>

      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Accounts</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Full Control</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Create and manage administrator accounts for your business team with full permissions across CRM, bot settings, and operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdmins}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", refreshing && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition-all"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Administrator</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Admins</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Shield className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{admins.length}</span>
            <span className="text-xs text-slate-400 font-medium">registered</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Access Level</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">100%</span>
            <span className="text-xs text-emerald-600 font-semibold">Super Admin Rights</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Logged In As</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <User className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-sm font-bold text-slate-900 truncate block">
              {currentUser?.name || currentUser?.email || "Current Admin"}
            </span>
            <span className="text-xs text-slate-400 font-medium truncate block mt-0.5">
              {currentUser?.email}
            </span>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search admins by name or email..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 outline-none transition-all focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium">
          Showing <strong>{filteredAdmins.length}</strong> of {admins.length} administrators
        </span>
      </div>

      {/* Admins Table / List */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-xs text-slate-500 font-medium">Loading administrator accounts...</p>
          </div>
        </div>
      ) : filteredAdmins.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200 text-slate-400 mb-3">
            <Shield className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No administrators found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {searchQuery ? "No admin accounts match your search query." : "Click '+ Add Administrator' to create an admin account for a team member."}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="mt-3 text-xs font-semibold text-indigo-600 hover:underline"
            >
              Clear search filter
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {filteredAdmins.map((admin) => {
            const isCurrentUser = currentUser?.id === admin.id || currentUser?.email === admin.email;
            const initial = (admin.name || admin.email).charAt(0).toUpperCase();

            return (
              <div
                key={admin.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 transition-colors hover:bg-slate-50/70",
                  isCurrentUser && "bg-indigo-50/30"
                )}
              >
                {/* Admin Profile & Info */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-base font-bold text-white shadow-xs">
                    {initial}
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
                      <Shield className="h-2.5 w-2.5 text-white" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {admin.name || "Administrator"}
                      </h3>
                      {isCurrentUser && (
                        <span className="rounded-full bg-indigo-100 border border-indigo-200/60 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                          You
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Admin Role
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-1">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-mono text-slate-600 font-medium">
                        {admin.email}
                      </span>
                      <CopyButton text={admin.email} title="Copy email address" />
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-600">WhatsApp Bot Settings</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-600">Leads & CRM</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span className="text-slate-600">Staff & Admin Management</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => openEditModal(admin)}
                    className="flex h-8.5 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all"
                    title="Edit administrator details"
                  >
                    <Pencil className="h-3.5 w-3.5 text-slate-500" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => setDeleteConfirmAdmin(admin)}
                    disabled={isCurrentUser || admins.length <= 1}
                    className={cn(
                      "flex h-8.5 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all shadow-xs",
                      isCurrentUser || admins.length <= 1
                        ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                        : "border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-100/70"
                    )}
                    title={
                      isCurrentUser 
                        ? "You cannot delete your own active account" 
                        : admins.length <= 1 
                        ? "At least one admin must remain" 
                        : "Delete administrator"
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Administrator Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                  <ShieldCheck className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingAdmin ? "Edit Administrator" : "Add New Administrator"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingAdmin ? "Update administrator credentials" : "Grant full business administrative privileges"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200/60 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@business.com"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  {editingAdmin ? "New Password (Leave blank to keep unchanged)" : "Password *"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required={!editingAdmin}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingAdmin ? "Enter new password..." : "Min 6 characters"}
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Administrator Privileges:
                </p>
                <p className="text-[11px] text-slate-500">
                  This user will have full access to your WhatsApp account connection, system prompt tuning, CRM leads, and can invite other administrators.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {isSaving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingAdmin ? "Save Changes" : "Create Administrator"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 border border-rose-200/60">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Administrator</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Are you sure you want to permanently delete administrator account{" "}
              <strong className="text-slate-900">{deleteConfirmAdmin.name || deleteConfirmAdmin.email}</strong> (
              <span className="font-mono">{deleteConfirmAdmin.email}</span>)? They will lose access to this business immediately.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmAdmin(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
