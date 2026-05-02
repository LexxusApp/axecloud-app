import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, Moon, Star, Bell, Loader2, X, CheckCircle2, Ticket, User, Search, UserPlus, Lock, Smartphone, MessageSquare, ImagePlus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { SkeletonBlock, CalendarEventRowSkeleton } from '../components/Skeleton';
import { readStaleCache, writeStaleCache } from '../lib/staleCache';
import { hasPlanAccess, hasPremiumTierFeatures } from '../constants/plans';

interface Event {
  id: string;
  titulo: string;
  data: string;
  hora: string;
  tipo: string;
  descricao: string;
  status_confirmacao: string;
  banner_url?: string | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const i = r.indexOf(',');
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

interface Guest {
  id: string;
  nome: string;
  telefone?: string | null;
  status: 'Confirmado' | 'Pendente' | 'Check-in';
}

interface CalendarProps {
  user?: any;
  userRole?: string;
  tenantData?: any;
  setActiveTab: (tab: string) => void;
}

export default function Calendar({ user, userRole, tenantData, setActiveTab }: CalendarProps) {
  const isFilho = userRole === 'filho';
  const isGlobalAdmin = tenantData?.is_admin_global === true;
  // Não-filhos são sempre gestores do terreiro independente do role exato no banco.
  const isAdmin = !isFilho;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEventForGuests, setSelectedEventForGuests] = useState<Event | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'guests' | 'preparation'>('guests');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  
  // Ritual Tasks State
  const [children, setChildren] = useState<any[]>([]);
  const [ritualTasks, setRitualTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'view' | 'management'>('view');
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'event' | 'guest' | 'task', title?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNotifying, setIsNotifying] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [filhoEventDetail, setFilhoEventDetail] = useState<Event | null>(null);

  const hasAccess = hasPlanAccess(tenantData?.plan, 'gestao_eventos', tenantData?.is_admin_global);
  const effectiveTenantId = tenantData?.tenant_id || (!isFilho ? user?.id : undefined);

  const handleNotifyAll = async (event: Event) => {
    try {
      setIsNotifying(event.id);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/push-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          tenantId: effectiveTenantId,
          title: `🗓️ Novo Evento: ${event.titulo}`,
          body: `Marcado para ${new Date(event.data).toLocaleDateString('pt-BR')} às ${event.hora}. Contamos com sua presença!`,
          url: '/calendar'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      alert(`Notificação enviada com sucesso para ${data.sentCount} dispositivos!`);
    } catch (error: any) {
      console.error('Error notifying all:', error);
      alert('Erro ao enviar notificação: ' + error.message);
    } finally {
      setIsNotifying(null);
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    titulo: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    hora: '20:00',
    tipo: 'Gira',
    descricao: '',
    status_confirmacao: 'Confirmado'
  });

  useEffect(() => {
    if (!effectiveTenantId) {
      setLoading(true);
      return;
    }
    void fetchEvents();
    void fetchChildren();
    // Filho: recarrega ao mudar o mês (faixa de datas). Zelador: lista completa, só refetch ao trocar terreiro/papel.
  }, isFilho ? [currentMonth, effectiveTenantId, isFilho] : [effectiveTenantId, isFilho]);

  useEffect(() => {
    if (selectedEventForGuests) {
      fetchGuests(selectedEventForGuests.id);
      fetchRitualTasks(selectedEventForGuests.id);
      setActiveModalTab('guests');
    }
  }, [selectedEventForGuests]);

  useEffect(() => {
    if (!isModalOpen) {
      setBannerFile(null);
      setBannerPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [isModalOpen]);

  async function fetchChildren() {
    if (!effectiveTenantId) return;

    try {
      const { data, error } = await supabase
        .from('filhos_de_santo')
        .select('id, nome, orixa_frente')
        .eq('tenant_id', effectiveTenantId)
        .order('nome');
      
      if (error) throw error;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  }

  async function fetchRitualTasks(eventId: string) {
    setLoadingTasks(true);
    try {
      const { data, error } = await supabase
        .from('ritual_tasks')
        .select('id, event_id, task_name, is_completed, assigned_to, created_at')
        .eq('event_id', eventId)
        .order('created_at');
      
      if (error) throw error;
      setRitualTasks(data || []);
    } catch (error) {
      console.error('Error fetching ritual tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function addRitualTask() {
    if (!newTaskName.trim() || !selectedEventForGuests) return;
    
    try {
      const { data, error } = await supabase
        .from('ritual_tasks')
        .insert([{
          event_id: selectedEventForGuests.id,
          task_name: newTaskName.trim(),
          is_completed: false
        }])
        .select()
        .single();

      if (error) throw error;
      setRitualTasks([...ritualTasks, data]);
      setNewTaskName('');
    } catch (error) {
      console.error('Error adding ritual task:', error);
    }
  }

  async function updateRitualTask(taskId: string, updates: any) {
    try {
      const { error } = await supabase
        .from('ritual_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;
      setRitualTasks(ritualTasks.map(t => t.id === taskId ? { ...t, ...updates } : t));

      // Simulate Notification
      if (updates.assigned_to) {
        const assignedChild = children.find(c => c.id === updates.assigned_to);
        if (assignedChild) {
          console.log(`[Notification] Tarefa atribuída a ${assignedChild.nome}`);
          // In a real app, you would trigger a push notification or save a notification record here
        }
      }
    } catch (error) {
      console.error('Error updating ritual task:', error);
    }
  }

  async function deleteRitualTask(taskId: string) {
    try {
      const { error } = await supabase
        .from('ritual_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      setRitualTasks(ritualTasks.filter(t => t.id !== taskId));
    } catch (error) {
      console.error('Error deleting ritual task:', error);
    }
  }

  async function fetchEvents() {
    if (!effectiveTenantId) return;

    // Gestor: traz todos os eventos do terreiro (gestão e “próximo evento” não dependem do mês visível)
    if (!isFilho) {
      const cacheKey = `cal_events_all_${effectiveTenantId}`;
      const cached = readStaleCache<Event[]>(cacheKey);
      if (cached != null) {
        setEvents(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const url = `/api/events?tenantId=${encodeURIComponent(effectiveTenantId)}`;
        const response = await fetch(url);
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Failed to fetch events (${response.status}): ${body}`);
        }
        const { data } = await response.json();
        const list = data || [];
        setEvents(list);
        writeStaleCache(cacheKey, list);
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const monthStart = startOfMonth(currentMonth);
    const rangeEnd = addDays(endOfMonth(currentMonth), 7);
    const monthKey = format(monthStart, 'yyyy-MM');
    const cacheKey = `cal_events_${effectiveTenantId}_${monthKey}`;

    const cached = readStaleCache<Event[]>(cacheKey);
    if (cached != null) {
      setEvents(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const url = `/api/events?tenantId=${encodeURIComponent(effectiveTenantId)}&start=${format(monthStart, 'yyyy-MM-dd')}&end=${format(rangeEnd, 'yyyy-MM-dd')}`;
      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Failed to fetch events (${response.status}): ${body}`);
      }
      const { data } = await response.json();
      const list = data || [];
      setEvents(list);
      writeStaleCache(cacheKey, list);
    } catch (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGuests(eventId: string) {
    setLoadingGuests(true);
    try {
      const { data, error } = await supabase
        .from('convidados_eventos')
        .select('id, nome, telefone, status')
        .eq('event_id', eventId)
        .order('nome');
      
      if (error) throw error;
      setGuests(data || []);
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoadingGuests(false);
    }
  }

  async function addGuest() {
    if (!newGuestName.trim() || !selectedEventForGuests) return;
    
    try {
      const { data, error } = await supabase
        .from('convidados_eventos')
        .insert([{
          event_id: selectedEventForGuests.id,
          nome: newGuestName.trim(),
          telefone: newGuestPhone.trim() ? newGuestPhone.trim().replace(/\D/g, '') : null,
          status: 'Pendente' // Modifiquei de Confirmado para Pendente, para dar o sentido na confirmação
        }])
        .select()
        .single();

      if (error) throw error;
      setGuests([...guests, data]);

      // Disparar WhatsApp se for premium e e houver telefone
      const isPremium = tenantData?.is_admin_global || hasPremiumTierFeatures(tenantData?.plan);
      if (isPremium && newGuestPhone.trim()) {
         try {
           const { data: { session } } = await supabase.auth.getSession();
           await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({
                tipo: 'convite_evento',
                forcePhone: newGuestPhone.trim(),
                variables: {
                  nome_convidado: newGuestName.trim(),
                  nome_evento: selectedEventForGuests.titulo,
                  data_evento: format(parseISO(selectedEventForGuests.data), 'dd/MM/yyyy'),
                  hora_evento: selectedEventForGuests.hora,
                  nome_terreiro: tenantData?.nome_terreiro || 'Nosso Terreiro'
                }
              })
           });
         } catch(e) {
            console.error('Erro ao enviar whatsapp para convidado', e);
         }
      }

      setNewGuestName('');
      setNewGuestPhone('');
    } catch (error) {
      console.error('Error adding guest:', error);
      alert('Erro ao adicionar convidado.');
    }
  }

  async function updateGuestStatus(guestId: string, status: Guest['status']) {
    try {
      const { error } = await supabase
        .from('convidados_eventos')
        .update({ status })
        .eq('id', guestId);

      if (error) throw error;
      setGuests(guests.map(g => g.id === guestId ? { ...g, status } : g));
    } catch (error) {
      console.error('Error updating guest status:', error);
    }
  }

  async function removeGuest(guestId: string) {
    try {
      const { error } = await supabase
        .from('convidados_eventos')
        .delete()
        .eq('id', guestId);

      if (error) throw error;
      setGuests(guests.filter(g => g.id !== guestId));
    } catch (error) {
      console.error('Error removing guest:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let banner_url: string | undefined;
      if (bannerFile && effectiveTenantId) {
        const fileData = await fileToBase64(bannerFile);
        const uploadRes = await fetch('/api/v1/event-banner', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({
            fileData,
            fileName: bannerFile.name,
            contentType: bannerFile.type,
            tenantId: effectiveTenantId,
          }),
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          throw new Error(uploadJson.error || 'Falha ao enviar o banner');
        }
        if (uploadJson.publicUrl) banner_url = uploadJson.publicUrl;
      }

      const eventData = {
        ...formData,
        ...(banner_url ? { banner_url } : {}),
        lider_id: user?.id,
        tenant_id: effectiveTenantId || user?.id
      };

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(eventData)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create event');
      }
      
      setIsModalOpen(false);
      setFormData({
        titulo: '',
        data: format(new Date(), 'yyyy-MM-dd'),
        hora: '20:00',
        tipo: 'Gira',
        descricao: '',
        status_confirmacao: 'Confirmado'
      });
      fetchEvents();
    } catch (error: any) {
      console.error('Error adding event:', error);
      alert(error.message || 'Erro ao criar evento.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEventPassed = (dateStr: string, timeStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const eventDateTime = new Date(year, month - 1, day, hours, minutes);
      return eventDateTime < new Date();
    } catch (err) {
      return false;
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getEventColor = (type: string) => {
    switch (type) {
      case 'Festa': return 'bg-green-500';
      case 'Obrigação': return 'bg-amber-500';
      case 'Manutenção': return 'bg-blue-500';
      case 'Gira': return 'bg-white';
      default: return 'bg-primary';
    }
  };

  const getEventStyles = (type: string) => {
    switch (type) {
      case 'Festa': return 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]';
      case 'Obrigação': return 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]';
      case 'Manutenção': return 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]';
      case 'Gira': return 'bg-white/5 text-white border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]';
      default: return 'bg-[#FBBC00]/10 text-[#FBBC00] border-[#FBBC00]/20 shadow-[0_0_10px_rgba(251,188,0,0.1)]';
    }
  };

  const parseEventDateTime = (e: Event) => {
    const [y, m, d] = e.data.split('-').map(Number);
    const parts = (e.hora || '0:0:0').toString().split(':').map((p) => parseInt(p, 10) || 0);
    const h = parts[0] ?? 0;
    const min = parts[1] ?? 0;
    const s = parts[2] ?? 0;
    return new Date(y, m - 1, d, h, min, s);
  };

  /** Próximo evento futuro (qualquer data/mês) — requer lista completa no zelador. */
  const nextUpcomingEvent = useMemo(() => {
    const now = new Date();
    return [...events]
      .filter((e) => {
        try {
          return parseEventDateTime(e).getTime() > now.getTime();
        } catch {
          return false;
        }
      })
      .sort((a, b) => parseEventDateTime(a).getTime() - parseEventDateTime(b).getTime())[0] ?? null;
  }, [events]);

  /** Todos os eventos em ordem cronológica (gestão: qualquer mês/ano). */
  const eventsSorted = useMemo(() => {
    return [...events].sort(
      (a, b) => parseEventDateTime(a).getTime() - parseEventDateTime(b).getTime()
    );
  }, [events]);

  if (loading && events.length === 0) {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader
          title={
            isFilho ? (
              <>Giras & <span className="text-primary">Eventos</span></>
            ) : (
              <>Calendário de <span className="text-primary">Axé</span></>
            )
          }
          subtitle={isFilho ? 'Calendário de obrigações do terreiro.' : 'Gestão de obrigações e eventos espirituais.'}
          tenantData={tenantData}
          setActiveTab={setActiveTab}
        />
        <div className="flex-1 px-4 md:px-6 lg:px-10 pb-20 max-w-[1200px] mx-auto w-full">
          <div className="rounded-2xl border border-white/5 bg-card/30 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <SkeletonBlock className="h-6 w-40" />
              <div className="flex gap-2">
                <SkeletonBlock className="h-9 w-9 rounded-lg" />
                <SkeletonBlock className="h-9 w-9 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="text-center text-[8px] font-black text-gray-600 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <SkeletonBlock key={i} className="aspect-square rounded-xl min-h-[2.25rem]" />
              ))}
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <CalendarEventRowSkeleton />
            <CalendarEventRowSkeleton />
            <CalendarEventRowSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // Layout exclusivo para filhos de santo: calendário compacto + lista de eventos abaixo
  if (isFilho) {
    const upcomingEvents = [...events]
      .sort((a, b) => {
        const dateA = new Date(`${a.data}T${a.hora}`);
        const dateB = new Date(`${b.data}T${b.hora}`);
        return dateA.getTime() - dateB.getTime();
      });

    return (
      <div className="flex flex-col min-h-full">
        <PageHeader
          title={<>Giras & <span className="text-primary">Eventos</span></>}
          subtitle="Calendário de obrigações do terreiro."
          tenantData={tenantData}
          setActiveTab={setActiveTab}
          actions={
            <button
              onClick={fetchEvents}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-colors"
              title="Atualizar"
            >
              <Loader2 className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>
          }
        />

        <div className="flex-1 px-4 md:px-6 lg:px-10 pb-24 max-w-[1200px] mx-auto w-full animate-in zoom-in-95 duration-700">
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

            {/* Calendário compacto — coluna esquerda */}
            <div className="card-luxury p-5 lg:sticky lg:top-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-white capitalize">
                  {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                </h3>
                <div className="flex gap-2">
                  <button onClick={prevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={nextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                  <div key={i} className="text-center text-[10px] font-black text-gray-600 uppercase tracking-widest py-1">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const dayEvents = events.filter(e => isSameDay(parseISO(e.data), day));
                  const isSelected = isSameDay(day, selectedDate);
                  const isCurrentMonth = isSameMonth(day, monthStart);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "aspect-square rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5",
                        isSelected
                          ? "bg-primary/20 border-primary/50 shadow-[0_0_12px_rgba(251,188,0,0.15)]"
                          : isToday
                            ? "bg-white/10 border-white/20"
                            : "bg-card border-border hover:border-white/20 hover:bg-white/5",
                        !isCurrentMonth && "opacity-25"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-black",
                        isSelected ? "text-primary" : isToday ? "text-white" : (dayEvents.length > 0 ? "text-primary" : "text-gray-500")
                      )}>
                        {format(day, 'd')}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 justify-center">
                          {dayEvents.slice(0, 3).map((e, i) => (
                            <div key={i} className={cn("w-1 h-1 rounded-full", getEventColor(e.tipo))} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/5">
                {[
                  { tipo: 'Gira', color: 'bg-white' },
                  { tipo: 'Festa', color: 'bg-green-500' },
                  { tipo: 'Obrigação', color: 'bg-amber-500' },
                  { tipo: 'Reunião', color: 'bg-primary' },
                ].map(item => (
                  <div key={item.tipo} className="flex items-center gap-1.5">
                    <div className={cn("w-2 h-2 rounded-full", item.color)} />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{item.tipo}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista de eventos — coluna direita */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" />
                Próximos Eventos
              </h3>

              {loading ? (
                <div className="space-y-3 py-4">
                  <CalendarEventRowSkeleton />
                  <CalendarEventRowSkeleton />
                  <CalendarEventRowSkeleton />
                </div>
              ) : upcomingEvents.length === 0 ? (
                <div className="card-luxury p-10 text-center text-gray-500 font-medium">
                  Nenhum evento cadastrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event, idx) => {
                    const passed = isEventPassed(event.data, event.hora);
                    return (
                      <motion.button
                        type="button"
                        key={event.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        onClick={() => setFilhoEventDetail(event)}
                        className={cn(
                          "card-luxury w-full text-left overflow-hidden border-l-4 transition-all hover:border-primary/80 hover:shadow-lg hover:shadow-primary/5",
                          passed ? "border-l-gray-600 opacity-60" : "border-l-primary"
                        )}
                      >
                        <div className="relative h-28 w-full overflow-hidden bg-[#0d0d0d]">
                          {event.banner_url ? (
                            <img
                              src={event.banner_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-transparent">
                              <CalendarIcon className="h-10 w-10 text-white/15" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1.5">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full backdrop-blur-sm",
                              passed ? "bg-black/50 text-gray-400" : "bg-primary/90 text-black"
                            )}>
                              {event.tipo}
                            </span>
                            {passed && (
                              <span className="text-[10px] font-black text-red-300 uppercase tracking-widest bg-red-500/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                Encerrado
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-black text-white text-base leading-tight">{event.titulo}</h4>
                              {event.descricao && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{event.descricao}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-black text-white">
                                {format(parseISO(event.data), 'dd/MM', { locale: ptBR })}
                              </div>
                              <div className="text-[10px] font-bold text-gray-500">{event.hora}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 text-gray-600 text-[10px] font-bold uppercase tracking-wider flex-wrap">
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3" />
                              {format(parseISO(event.data), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                            </div>
                            <span>·</span>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {event.hora}
                            </div>
                          </div>
                          <p className="text-[10px] font-bold text-primary/80 mt-2 uppercase tracking-widest">Toque para ver detalhes</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {filhoEventDetail && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFilhoEventDetail(null)}
                className="absolute inset-0 bg-background/80 backdrop-blur-xl"
              />
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 60 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl sm:max-w-lg"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <CalendarIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-white sm:text-lg">{filhoEventDetail.titulo}</h3>
                      <p className="text-xs font-medium uppercase tracking-widest text-gray-500">{filhoEventDetail.tipo}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilhoEventDetail(null)}
                    className="shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/5"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {filhoEventDetail.banner_url && (
                    <div className="relative w-full overflow-hidden bg-[#0d0d0d]">
                      <img
                        src={filhoEventDetail.banner_url}
                        alt=""
                        className="max-h-[min(40vh,280px)] w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <div className="flex items-center gap-2 text-white">
                        <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="font-bold">
                          {format(parseISO(filhoEventDetail.data), "EEEE, dd 'de' MMMM yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-white">
                        <Clock className="h-4 w-4 shrink-0 text-primary" />
                        <span className="font-bold">{filhoEventDetail.hora}</span>
                      </div>
                    </div>
                    {filhoEventDetail.descricao ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Descrição</p>
                        <p className="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">{filhoEventDetail.descricao}</p>
                      </div>
                    ) : (
                      <p className="text-sm italic text-gray-600">Sem descrição adicional.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full lg:min-h-0 lg:flex-1">
      <PageHeader 
        title={<>Calendário de <span className="text-primary">Axé</span></>}
        subtitle="Gestão de obrigações e eventos espirituais."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
        actions={
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="flex bg-white/5 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveView('view')}
                  className={cn("px-6 py-2.5 rounded-lg font-bold text-sm transition-all", activeView === 'view' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
                >
                  Visualizar Datas
                </button>
                <button 
                  onClick={() => setActiveView('management')}
                  className={cn("px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2", activeView === 'management' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
                >
                  Gestão de Eventos
                  {!hasAccess && <Lock className="w-4 h-4 text-[#FBBC00]" />}
                </button>
              </div>
            )}
            <button 
              onClick={fetchEvents}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-colors"
              title="Atualizar"
            >
              <Loader2 className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>
          </div>
        }
      />

      <div className="flex-1 px-4 md:px-6 lg:px-10 pb-20 max-w-[1440px] mx-auto w-full space-y-8 animate-in zoom-in-95 duration-700 lg:flex lg:flex-col lg:min-h-0">
        {activeView === 'view' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 lg:items-stretch lg:flex-1 lg:min-h-[calc(100dvh-11.5rem)]">
        {/* Calendário — desktop: altura até preencher a viewport (área útil abaixo do header) */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-4 min-w-0 w-full lg:h-full lg:flex lg:flex-col lg:min-h-0">
          <div className="card-luxury p-4 md:p-5 lg:p-6 lg:pb-7 w-full max-w-full lg:max-w-[720px] xl:max-w-[780px] lg:flex-1 lg:flex lg:flex-col lg:min-h-0 lg:h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-white capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h3>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 bg-primary text-black px-3 py-2 rounded-lg hover:bg-primary/90 transition-all font-black text-[10px] uppercase tracking-wider shadow-lg shadow-primary/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Novo Evento</span>
                    <span className="inline sm:hidden">Novo</span>
                  </button>
                )}
                <div className="flex gap-1.5">
                  <button onClick={prevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={nextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 lg:gap-1.5 mb-2 lg:mb-2.5">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                <div key={day} className="text-center text-[9px] font-black text-gray-500 uppercase tracking-widest py-1 lg:py-1.5">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 lg:gap-1.5 lg:flex-1 lg:min-h-0 lg:[grid-template-rows:repeat(6,minmax(2.75rem,1fr))]">
              {calendarDays.map((day, idx) => {
                const dayEvents = events.filter(e => isSameDay(parseISO(e.data), day));
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "aspect-square p-0.5 sm:p-1 rounded-lg border transition-all flex flex-col items-center relative group overflow-hidden",
                      "lg:aspect-auto lg:h-full lg:min-h-[2.75rem] lg:max-h-none lg:py-1.5",
                      isSelected 
                        ? "bg-white/10 border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.1)]" 
                        : "bg-card border-border hover:border-white/20 hover:bg-white/5",
                      !isCurrentMonth && "opacity-30"
                    )}
                  >
                    {/* Event Highlight Glow */}
                    {dayEvents.length > 0 && !isSelected && (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                    )}

                    <span className={cn(
                      "text-xs font-black relative z-10",
                      isSelected ? "text-white" : (dayEvents.length > 0 ? "text-primary" : "text-gray-400")
                    )}>
                      {format(day, 'd')}
                    </span>
                    
                    {/* Event dots */}
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-auto pb-0.5 relative z-10 flex-wrap justify-center">
                        {dayEvents.slice(0, 3).map((e, i) => (
                          <div key={i} className="w-1 h-1 rounded-full bg-primary" />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Agenda / lateral — mesma altura mínima que o calendário; conteúdo distribuído no eixo vertical */}
        <div className="lg:col-span-5 xl:col-span-5 space-y-8 min-w-0 lg:h-full lg:min-h-0 lg:flex lg:flex-col lg:justify-between lg:space-y-0 lg:gap-8">
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Próximo evento
            </h3>
            <div className="space-y-4">
              {nextUpcomingEvent && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={nextUpcomingEvent.id}
                  className="card-luxury p-5 border-l-4 border-l-primary"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-primary uppercase tracking-widest">{nextUpcomingEvent.tipo}</span>
                    <div className="flex gap-2">
                      {isAdmin && (
                        <>
                          {hasAccess && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEventForGuests(nextUpcomingEvent);
                              }}
                              className="p-1 hover:bg-white/10 rounded text-primary hover:text-primary/80 transition-colors"
                              title="Gestão de Convidados"
                            >
                              <Ticket className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete({ id: nextUpcomingEvent.id, type: 'event', title: nextUpcomingEvent.titulo });
                            }}
                            className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <Bell className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                  <h4 className="font-bold text-white text-lg">{nextUpcomingEvent.titulo}</h4>
                  <div className="flex flex-col gap-1 text-gray-400 mt-2">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium">
                        {format(parseISO(nextUpcomingEvent.data), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium">{nextUpcomingEvent.hora}</span>
                    </div>
                  </div>
                </motion.div>
              )}
              {!nextUpcomingEvent && (
                <div className="card-luxury p-8 text-center text-gray-500 font-medium">
                  Não há eventos futuros agendados.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Moon className="w-5 h-5 text-primary" />
              Influência Astral
            </h3>
            <div className="card-luxury p-6 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Moon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-white">Lua Crescente</h4>
                  <p className="text-xs text-gray-400 font-medium">Ciclo de Expansão</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed font-medium">
                Período favorável para ebós de prosperidade e abertura de caminhos. Evite rituais de banimento.
              </p>
            </div>
          </div>
        </div>
        </div>
      ) : (
        <div className={cn("relative min-h-[60vh] rounded-[2.5rem]", !hasAccess && "overflow-hidden")}>
          {!hasAccess && (
            <div className="absolute inset-0 z-20 flex items-center justify-center backdrop-blur-md bg-background/60">
              <div className="card-luxury p-10 max-w-md text-center space-y-6 border-[#FBBC00]/20 shadow-2xl shadow-[#FBBC00]/10">
                <div className="w-20 h-20 bg-[#FBBC00]/10 rounded-full flex items-center justify-center mx-auto">
                  <Lock className="w-10 h-10 text-[#FBBC00]" />
                </div>
                <h3 className="text-2xl font-black text-white">Organize suas Giras e Festas com Precisão.</h3>
                <p className="text-gray-400 font-medium">A Gestão de Eventos permite controlar convidados, tarefas e cronogramas. Disponível apenas no Plano Oirô.</p>
                <button className="w-full bg-[#FBBC00] text-black font-black py-4 rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-[#FBBC00]/20">
                  Fazer Upgrade Agora
                </button>
              </div>
            </div>
          )}

          <div className={cn("space-y-6", !hasAccess && "opacity-30 pointer-events-none blur-sm")}>
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black text-white">Todos os Eventos</h3>
              {isAdmin && (
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="bg-primary text-background px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                >
                  <Plus className="w-5 h-5" />
                  Novo Evento
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {eventsSorted.map(event => {
                const passed = isEventPassed(event.data, event.hora);
                return (
                <div key={event.id} className={cn("card-luxury overflow-hidden border-l-4 flex flex-col h-full p-0", passed ? "border-l-gray-500 opacity-75" : "border-l-primary")}>
                  <div className="relative h-40 w-full shrink-0 overflow-hidden bg-[#0d0d0d]">
                    {event.banner_url ? (
                      <img src={event.banner_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-transparent">
                        <CalendarIcon className="h-12 w-12 text-white/15" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-white/10 bg-black/60 backdrop-blur-sm text-primary">
                      {event.tipo}
                    </span>
                    {passed && (
                      <span className="absolute top-2 right-2 text-[10px] font-black text-red-300 uppercase tracking-widest bg-red-500/80 backdrop-blur-sm px-2 py-0.5 rounded-md">
                        Encerrado
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 p-5 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="font-bold text-white text-lg leading-tight line-clamp-2 flex-1 min-w-0">{event.titulo}</h4>
                      {isAdmin && (
                        <div className="flex gap-1 shrink-0">
                          {!passed && (
                            <button 
                              type="button"
                              onClick={() => handleNotifyAll(event)}
                              disabled={isNotifying === event.id}
                              className="p-2 bg-[#FBBC00]/10 hover:bg-[#FBBC00]/20 rounded-xl text-[#FBBC00] transition-colors flex items-center justify-center disabled:opacity-50"
                              title="Notificar todos os filhos"
                            >
                              {isNotifying === event.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                            </button>
                          )}
                          <button 
                            type="button"
                            onClick={() => {
                              setSelectedEventForGuests(event);
                            }}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-primary transition-colors"
                            title="Gestão de Convidados"
                          >
                            <Ticket className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setItemToDelete({ id: event.id, type: 'event', title: event.titulo })}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">{event.descricao || 'Sem descrição.'}</div>
                    <div className="flex items-center gap-4 text-gray-500 text-sm font-medium pt-4 border-t border-white/5 mt-auto">
                      <div className="flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4 shrink-0" />
                        {format(parseISO(event.data), 'dd/MM/yyyy')}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 shrink-0" />
                        {event.hora}
                      </div>
                    </div>
                  </div>
                </div>
              )})}
              {eventsSorted.length === 0 && (
                <div className="col-span-full card-luxury p-12 text-center text-gray-500 font-medium">
                  Nenhum evento cadastrado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl sm:max-w-lg"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white sm:text-xl">Novo Evento</h3>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Cronograma de Axé</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Título do Evento</label>
                  <input required type="text" value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-primary"
                    placeholder="Ex: Toque de Oxóssi" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Data</label>
                    <input required type="date" value={formData.data}
                      onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Hora</label>
                    <input required type="time" value={formData.hora}
                      onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-primary" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Tipo de Evento</label>
                  <select required value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-primary [&>option]:bg-[#1B1C1C]">
                    <option value="Gira">Gira</option>
                    <option value="Festa">Festa</option>
                    <option value="Obrigação">Obrigação</option>
                    <option value="Manutenção">Manutenção</option>
                    <option value="Reunião">Reunião</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Descrição</label>
                  <textarea value={formData.descricao} rows={3}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-primary"
                    placeholder="Detalhes do evento..." />
                </div>

                <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Banner do evento (opcional)</label>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (!f.type.startsWith('image/')) {
                        alert('Selecione um arquivo de imagem.');
                        return;
                      }
                      if (f.size > 4.5 * 1024 * 1024) {
                        alert('Imagem muito grande (máx. 4,5 MB).');
                        return;
                      }
                      setBannerFile(f);
                      setBannerPreview((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return URL.createObjectURL(f);
                      });
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-white/10"
                    >
                      <ImagePlus className="h-4 w-4 text-primary" />
                      Escolher imagem
                    </button>
                    {bannerPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setBannerFile(null);
                          setBannerPreview((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                        }}
                        className="rounded-xl px-3 py-2 text-xs font-bold text-gray-500 hover:text-red-400"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {bannerPreview && (
                    <div className="relative mt-1 overflow-hidden rounded-xl border border-white/10">
                      <img src={bannerPreview} alt="" className="max-h-36 w-full object-cover" />
                    </div>
                  )}
                  <p className="text-[10px] text-gray-600 leading-relaxed">JPEG, PNG, WebP ou GIF. Aparece na gestão de eventos e para os filhos de santo.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 rounded-2xl border border-white/5 bg-white/5 py-3 font-black text-sm text-white transition-all hover:bg-white/10">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-sm text-background shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guest Management Modal */}
      <AnimatePresence>
        {selectedEventForGuests && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedEventForGuests(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl sm:max-w-2xl"
            >
              <div className="flex shrink-0 flex-col gap-4 border-b border-white/5 px-5 py-4 sm:gap-6 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                      <Ticket className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-white sm:text-xl">{selectedEventForGuests.titulo}</h3>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Detalhes do Evento</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedEventForGuests(null)} className="shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex gap-4 border-b border-white/5 pb-2">
                  <button
                    onClick={() => setActiveModalTab('guests')}
                    className={cn(
                      "pb-2 text-sm font-black uppercase tracking-widest transition-colors relative",
                      activeModalTab === 'guests' ? "text-primary" : "text-gray-500 hover:text-white"
                    )}
                  >
                    Convidados
                    {activeModalTab === 'guests' && (
                      <motion.div layoutId="modalTab" className="absolute -bottom-[9px] left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveModalTab('preparation')}
                    className={cn(
                      "pb-2 text-sm font-black uppercase tracking-widest transition-colors relative",
                      activeModalTab === 'preparation' ? "text-primary" : "text-gray-500 hover:text-white"
                    )}
                  >
                    Preparação do Ritual
                    {activeModalTab === 'preparation' && (
                      <motion.div layoutId="modalTab" className="absolute -bottom-[9px] left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar">
                {activeModalTab === 'guests' ? (
                  <>
                    {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/5 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-white">{guests.length}</p>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-emerald-500">{guests.filter(g => g.status === 'Check-in').length}</p>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Presentes</p>
                  </div>
                  <div className="bg-primary/10 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-primary">{guests.filter(g => g.status === 'Confirmado').length}</p>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Confirmados</p>
                  </div>
                </div>

                {/* Add Guest */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={newGuestName}
                        onChange={e => setNewGuestName(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addGuest()}
                        placeholder="Nome do convidado..."
                        className="w-full bg-background border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:border-primary outline-none transition-all"
                      />
                    </div>
                    {hasPlanAccess(tenantData?.plan, 'whatsapp_invites', isGlobalAdmin) && (
                      <div className="flex-1 relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                        <input
                          type="text"
                          value={newGuestPhone}
                          onChange={e => setNewGuestPhone(e.target.value)}
                          onKeyPress={e => e.key === 'Enter' && addGuest()}
                          placeholder="WhatsApp (ex: 11999999999)..."
                          className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl pl-12 pr-4 py-3 text-white focus:border-emerald-500 outline-none transition-all placeholder:text-emerald-500/50"
                        />
                      </div>
                    )}
                    <button
                      onClick={addGuest}
                      className="bg-primary text-background px-6 py-3 rounded-xl font-black hover:scale-105 transition-all whitespace-nowrap self-stretch sm:self-auto"
                    >
                      Adicionar
                    </button>
                  </div>
                  {hasPlanAccess(tenantData?.plan, 'whatsapp_invites', isGlobalAdmin) && (
                    <div className="text-[10px] sm:text-xs text-gray-500 px-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> Preencha o WhatsApp para enviar o convite automaticamente</div>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar na lista..."
                    className="w-full bg-white/5 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-white focus:border-primary outline-none transition-all"
                  />
                </div>

                {/* List */}
                <div className="space-y-2">
                  {loadingGuests ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                  ) : guests.filter(g => g.nome.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                    guests
                      .filter(g => g.nome.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(guest => (
                      <div key={guest.id} className="bg-white/5 rounded-2xl p-4 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            guest.status === 'Check-in' ? "bg-emerald-500/20 text-emerald-500" : "bg-white/5 text-gray-500"
                          )}>
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-white">{guest.nome}</p>
                            <p className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              guest.status === 'Check-in' ? "text-emerald-500" : "text-gray-500"
                            )}>
                              {guest.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAdmin && (
                            <>
                              {guest.status !== 'Check-in' ? (
                                <button
                                  onClick={() => updateGuestStatus(guest.id, 'Check-in')}
                                  className="px-4 py-2 bg-emerald-500 text-white text-xs font-black rounded-lg hover:scale-105 transition-all"
                                >
                                  Check-in
                                </button>
                              ) : (
                                <button
                                  onClick={() => updateGuestStatus(guest.id, 'Confirmado')}
                                  className="px-4 py-2 bg-white/10 text-gray-400 text-xs font-black rounded-lg hover:bg-white/20 transition-all"
                                >
                                  Estornar
                                </button>
                              )}
                              <button
                                onClick={() => setItemToDelete({ id: guest.id, type: 'guest' })}
                                className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-gray-600 font-medium italic">
                      Nenhum convidado encontrado.
                    </div>
                  )}
                </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    {/* Add Task */}
                    {isAdmin && (
                      <div className="flex gap-3">
                        <div className="flex-1 relative">
                          <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                          <input
                            type="text"
                            value={newTaskName}
                            onChange={e => setNewTaskName(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && addRitualTask()}
                            placeholder="Nova tarefa (ex: Lavar o chão)..."
                            className="w-full bg-background border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:border-primary outline-none transition-all"
                          />
                        </div>
                        <button
                          onClick={addRitualTask}
                          className="bg-primary text-background px-6 py-3 rounded-xl font-black hover:scale-105 transition-all"
                        >
                          Adicionar
                        </button>
                      </div>
                    )}

                    {/* Tasks List */}
                    <div className="space-y-3">
                      {loadingTasks ? (
                        <div className="flex justify-center py-10">
                          <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                      ) : ritualTasks.length > 0 ? (
                        ritualTasks.map(task => (
                          <div 
                            key={task.id} 
                            className="bg-black/50 backdrop-blur-[25px] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <button
                                onClick={() => updateRitualTask(task.id, { is_completed: !task.is_completed })}
                                className={cn(
                                  "w-6 h-6 rounded border flex items-center justify-center transition-colors shrink-0",
                                  task.is_completed 
                                    ? "bg-[#FFD700] border-[#FFD700] text-black" 
                                    : "border-white/20 hover:border-[#FFD700]"
                                )}
                              >
                                {task.is_completed && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                              <div className="flex-1">
                                <p className={cn(
                                  "font-bold transition-all",
                                  task.is_completed ? "text-white/40 line-through" : "text-white/85"
                                )}>
                                  {task.task_name}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3 shrink-0">
                              {isAdmin && (
                                <>
                                  <select
                                    value={task.assigned_to || ''}
                                    onChange={(e) => updateRitualTask(task.id, { assigned_to: e.target.value || null })}
                                    className="bg-background/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white/85 focus:border-primary outline-none [&>option]:bg-[#1B1C1C]"
                                  >
                                    <option value="">Atribuir a...</option>
                                    {children.map(child => (
                                      <option key={child.id} value={child.id}>
                                        {child.nome}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => setItemToDelete({ id: task.id, type: 'task' })}
                                    className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-10 text-gray-600 font-medium italic">
                          Nenhuma tarefa cadastrada.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setItemToDelete(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 w-full space-y-5 rounded-3xl border border-white/10 bg-card px-6 py-8 text-center shadow-2xl sm:max-w-md"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                <X className="h-8 w-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white">Confirmar Exclusão</h3>
                <p className="text-sm text-gray-400 font-medium">
                  {itemToDelete.type === 'event' ? `Deseja realmente excluir o evento "${itemToDelete.title}"?` : 
                   itemToDelete.type === 'guest' ? 'Deseja remover este convidado da lista?' :
                   'Deseja excluir esta tarefa?'}
                </p>
              </div>
              <div className="flex gap-3">
                <button disabled={isDeleting} onClick={() => setItemToDelete(null)}
                  className="flex-1 rounded-2xl py-3 font-black text-sm text-gray-400 transition-all hover:bg-white/5">
                  Cancelar
                </button>
                <button disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      if (itemToDelete.type === 'event') {
                        const { data: { session } } = await supabase.auth.getSession();
                        const response = await fetch(`/api/events/${itemToDelete.id}`, {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${session?.access_token}` }
                        });
                        if (response.ok) fetchEvents();
                      } else if (itemToDelete.type === 'guest') {
                        await removeGuest(itemToDelete.id);
                      } else if (itemToDelete.type === 'task') {
                        await deleteRitualTask(itemToDelete.id);
                      }
                      setItemToDelete(null);
                    } catch (err) {
                      console.error('Error deleting item:', err);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 font-black text-sm text-white shadow-lg shadow-red-500/20 transition-all hover:scale-105">
                  {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
