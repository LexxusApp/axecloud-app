import * as fs from 'fs';

let code = fs.readFileSync('src/views/MasterPortal.tsx', 'utf8');

// Change Layout structure
// 1. Remove Sidebar component and sidebar logic
// 2. Change background and overall container
// 3. Implement Top Navigation

const newDesign = `
  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100 font-sans selection:bg-orange-500/30 overflow-x-hidden">
      
      {/* Floating Navigation Bar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-4xl">
        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(234,88,12,0.4)]">
                <Crown className="w-4 h-4 text-white" />
             </div>
             <span className="font-bold tracking-tight text-white italic hidden sm:block">Master <span className="opacity-50 font-normal">Portal</span></span>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 bg-white/5 rounded-full p-1 border border-white/5">
            {[
              { id: 'overview', icon: LayoutDashboard, label: 'Geral' },
              { id: 'tenants', icon: Users, label: 'Terreiros' },
              { id: 'plans', icon: DollarSign, label: 'Planos' },
              { id: 'billing', icon: BarChart3, label: 'Financeiro' },
              { id: 'logs', icon: History, label: 'Audit' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSubTab(item.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-medium",
                  activeSubTab === item.id 
                    ? "bg-white text-black shadow-lg" 
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:block">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
             <button onClick={onLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors">
                <LogOut className="w-5 h-5" />
             </button>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 sm:px-10 lg:px-16 max-w-[1600px] mx-auto">
        
        {/* Animated Title Section */}
        <div className="mb-16">
           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h1 className="text-6xl md:text-8xl font-serif italic tracking-tighter text-white">
                 Comando <span className="text-orange-600">Central</span>
              </h1>
              <div className="flex items-center gap-6 text-zinc-500 font-medium">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs uppercase tracking-widest">Sistema Operacional</span>
                 </div>
                 <span className="text-xs uppercase tracking-widest">•</span>
                 <span className="text-xs uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
           </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {activeSubTab === 'overview' && (
            <motion.div key="ov" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 md:grid-cols-12 gap-5 h-auto">
               
               {/* Bento: Large MRR Hero */}
               <div className="md:col-span-8 bg-[#111] border border-white/5 rounded-3xl p-10 flex flex-col justify-between group hover:border-orange-500/30 transition-all duration-500 min-h-[350px]">
                  <div className="flex justify-between items-start">
                     <span className="bg-orange-500/10 text-orange-500 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-orange-500/20">Financeiro Premium</span>
                     <TrendingUp className="w-8 h-8 text-zinc-800 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <div>
                     <p className="text-zinc-500 text-sm font-medium mb-2">Faturamento Recorrente Mensal</p>
                     <h3 className="text-6xl md:text-7xl font-bold tracking-tighter text-white mb-4">
                        {dashboardStats[1].value}
                     </h3>
                     <div className="flex items-center gap-3 text-emerald-500 text-sm font-bold">
                        <ArrowUpRight className="w-4 h-4" />
                        <span>+12.5% em relação ao mês anterior</span>
                     </div>
                  </div>
               </div>

               {/* Bento: Net Growth */}
               <div className="md:col-span-4 bg-orange-600 rounded-3xl p-10 flex flex-col justify-between text-white shadow-[0_0_80px_rgba(234,88,12,0.15)] min-h-[350px]">
                  <Zap className="w-12 h-12 opacity-50" />
                  <div>
                     <h4 className="text-5xl font-bold tracking-tighter mb-2">28%</h4>
                     <p className="text-orange-100/60 font-medium uppercase tracking-widest text-[10px]">Crescimento de Rede</p>
                     <p className="mt-6 text-sm font-medium leading-relaxed opacity-80">A taxa de adesão ao AxéCloud superou a meta trimestral em 14%.</p>
                  </div>
               </div>

               {/* Bento: Active Terminals List (Visual Preview) */}
               <div className="md:col-span-12 lg:col-span-4 bg-[#111] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                     <h4 className="text-lg font-bold text-white tracking-tight">Terminais Ativos</h4>
                     <Users className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="space-y-3">
                     {tenants.slice(0, 4).map((t, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-white/5">
                           <div className="w-10 h-10 rounded-full bg-orange-600/10 flex items-center justify-center text-orange-500 font-bold border border-orange-500/20">
                              {t.nome_terreiro.charAt(0)}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{t.nome_terreiro}</p>
                              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{t.plan}</p>
                           </div>
                        </div>
                     ))}
                     <button onClick={() => setActiveSubTab('tenants')} className="w-full py-4 text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-all">Ver Todos os {tenants.length} Terminais</button>
                  </div>
               </div>

               {/* Bento: Main Chart Area */}
               <div className="md:col-span-12 lg:col-span-8 bg-[#111] border border-white/5 rounded-3xl p-10 space-y-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                     <div>
                        <h4 className="text-xl font-bold text-white tracking-tight">Fluxo de Dados</h4>
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest mt-1">Sincronização em tempo real dos núcleos</p>
                     </div>
                     <div className="px-4 py-2 rounded-full bg-white/5 border border-white/5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        Semana Atual
                     </div>
                  </div>
                  <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                           <defs>
                              <linearGradient id="orangeGlow" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3}/>
                                 <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <Area type="monotone" dataKey="val" stroke="#ea580c" strokeWidth={4} fill="url(#orangeGlow)" animationDuration={1000} />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>

            </motion.div>
          )}

          {activeSubTab === 'tenants' && (
            <motion.div key="tenants" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div className="flex flex-col lg:flex-row items-center gap-6 justify-between bg-zinc-900 border border-white/5 p-8 rounded-3xl">
                  <div className="relative flex-1 w-full">
                     <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                     <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrar por nome ou e-mail..."
                        className="w-full bg-zinc-800/50 border border-white/5 rounded-2xl pl-16 pr-8 py-5 text-sm focus:outline-none focus:border-orange-500/50 transition-all font-medium"
                     />
                  </div>
                  <button onClick={() => setIsRegisterModalOpen(true)} className="w-full lg:w-auto bg-orange-600 text-white px-10 py-5 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-orange-950/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3">
                     <Plus className="w-5 h-5" /> Adicionar Terreiro
                  </button>
               </div>

               <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="border-b border-white/5">
                              <th className="px-10 py-8 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Identidade</th>
                              <th className="px-10 py-8 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Plano Ativo</th>
                              <th className="px-10 py-8 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Data Cadastro</th>
                              <th className="px-10 py-8 text-right text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ações Rápidas</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           {tenants.filter(t => t.nome_terreiro.toLowerCase().includes(searchTerm.toLowerCase()) || t.email.toLowerCase().includes(searchTerm.toLowerCase())).map((t) => (
                              <tr key={t.id} className="group hover:bg-white/[0.02] transition-colors">
                                 <td className="px-10 py-6">
                                    <div className="flex items-center gap-5">
                                       <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-xl font-bold border border-white/5 text-zinc-300">
                                          {t.nome_terreiro.charAt(0)}
                                       </div>
                                       <div>
                                          <p className="text-base font-bold text-white group-hover:text-orange-500 transition-colors leading-none mb-1.5">{t.nome_terreiro}</p>
                                          <p className="text-xs text-zinc-500 font-medium">{t.email}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="px-10 py-6">
                                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                       <div className={cn("w-1.5 h-1.5 rounded-full", t.plan === 'axe' ? 'bg-orange-500' : 'bg-purple-500')} />
                                       {t.plan}
                                    </span>
                                 </td>
                                 <td className="px-10 py-6 text-sm text-zinc-500 font-medium">
                                    {new Date(t.created_at).toLocaleDateString('pt-BR')}
                                 </td>
                                 <td className="px-10 py-6 text-right">
                                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button onClick={() => toggleStatus(t.id, t.is_blocked)} className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all border", t.is_blocked ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-white/5 border-white/5 text-zinc-500 hover:text-white")}>
                                          {t.is_blocked ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                       </button>
                                       <button onClick={() => { setTenantToDelete(t.id); setIsDeleteModalOpen(true); }} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-zinc-500 hover:text-red-500 transition-all">
                                          <Trash2 className="w-4 h-4" />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </motion.div>
          )}

          {activeSubTab === 'plans' && (
            <motion.div key="plans" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                     <h3 className="text-3xl font-bold tracking-tight text-white uppercase italic">Modelagem Escalar</h3>
                     <p className="text-zinc-500 font-medium mt-2">Defina os limites estratégicos de crescimento por nó.</p>
                  </div>
                  <button onClick={saveGlobalPlans} className="px-8 py-4 bg-orange-600 rounded-2xl text-white font-bold uppercase tracking-widest text-[10px] hover:scale-105 active:scale-95 transition-all">
                     Persistir Configurações
                  </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {['axe', 'oro', 'fundamento'].map(planKey => {
                     const plan = plans[planKey] || { name: '', price: 0, max_children: 0 };
                     return (
                        <div key={planKey} className="bg-zinc-900 border border-white/5 p-10 rounded-3xl space-y-8 relative group overflow-hidden">
                           <div className="absolute top-0 right-0 p-4">
                              <DollarSign className="w-12 h-12 text-white/5 group-hover:text-orange-500/10 transition-colors" />
                           </div>
                           <div className="space-y-6">
                              <div>
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Selo do Plano</label>
                                 <input type="text" value={plan.name} onChange={(e) => handlePlanChange(planKey, 'name', e.target.value)} className="w-full bg-black/30 border border-white/5 rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/50 transition-all" />
                              </div>
                              <div>
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-3">Taxa de Manutenção (BRL)</label>
                                 <input type="number" value={plan.price} onChange={(e) => handlePlanChange(planKey, 'price', e.target.value)} className="w-full bg-black/30 border border-white/5 rounded-2xl px-6 py-4 text-orange-500 text-2xl font-bold focus:outline-none focus:border-orange-500/50 transition-all" />
                              </div>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </motion.div>
          )}

          {activeSubTab === 'billing' && (
             <motion.div key="billing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <div className="bg-zinc-900 border border-white/5 p-16 rounded-[40px] flex flex-col items-center justify-center text-center space-y-8">
                   <div className="w-24 h-24 rounded-full bg-orange-600/10 border border-orange-500/20 flex items-center justify-center">
                      <BarChart3 className="w-10 h-10 text-orange-600" />
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Faturamento Consolidado</p>
                      <h3 className="text-7xl font-bold tracking-tighter text-white">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tenants.reduce((acc, t) => acc + (plans[t.plan?.toLowerCase()]?.price || 0), 0))}
                      </h3>
                   </div>
                   <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">Considerando todas as assinaturas ativas processadas via gateway integrado AxéCloud CORE.</p>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </main>
`;

// Replace the entire return statement
code = code.replace(/return \([\s\S]*?<\/AnimatePresence>[\s\S]*?<\/div>[\s\S]*?<\/main>[\s\S]*?<\/div>[\s\S]*?\);/g, newDesign);

// Inject needed styles to index.css or within the component
// Since we don't have Playfair easily reachable without editing index.css, we'll use serif fallback.
// But I'll edit index.css too.

fs.writeFileSync('src/views/MasterPortal.tsx', code);
console.log('Bento Design Re-engineered.');
