import * as fs from 'fs';

let code = fs.readFileSync('src/views/MasterPortal.tsx', 'utf8');

// Section Titles
code = code.replace(/<p className="text-\[10px\] font-black text-indigo-600 uppercase tracking-\[0\.4em\] leading-none mb-3 flex items-center gap-2">[\s\S]*?<Star className="w-3\.5 h-3\.5" \/> Portal Master Admin[\s\S]*?<\/p>/g, 
  `<p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest leading-none flex items-center gap-2">
    <Star className="w-3.5 h-3.5" /> Administração Central
  </p>`);

code = code.replace(/SYS_<span className="text-indigo-600">ADMIN<\/span>/g, 'Painel <span className="text-indigo-600">Master Admin</span>');

// Buttons and Badges
code = code.replace(/Estabilidade Global/g, 'Status do Sistema');
code = code.replace(/99\.9% UPTIME/g, '99.9% ONLINE');
code = code.replace(/p-3\.5 rounded-sm bg-\[\#0A0A0A\] border border-white\/5 hover:border-\[\#4F46E5\]\/50 transition-all text-gray-500 hover:text-indigo-600/g,
  'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-slate-600 font-bold text-sm shadow-sm');
code = code.replace(/<Activity className="w-5 h-5" \/>/g, '<Activity className="w-4 h-4 text-indigo-600" /> Atualizar Dados');

// Stats trends
code = code.replace(/bg-emerald-500\/15 text-emerald-500/g, 'bg-emerald-100 text-emerald-700 border border-emerald-100');

// Monitor de Rede section
code = code.replace(/Monitor de Atividade/g, 'Fluxo de Atividade');
code = code.replace(/Tráfego Nuclear da Rede/g, 'Volume de processamento em tempo real');
code = code.replace(/Live Now/g, 'Sincronizado');

// Graphics
code = code.replace(/bg-black\/40 p-5 rounded-\[1\.5rem\] border border-white\/5/g, 'bg-slate-50 p-5 rounded-2xl border border-slate-100');

// Tables
code = code.replace(/IDENTIFICAÇÃO NUCLEAR/g, 'IDENTIFICAÇÃO');
code = code.replace(/LICENÇA/g, 'PLANO');
code = code.replace(/REGISTRO/g, 'DATA DE CRIAÇÃO');
code = code.replace(/OPERAÇÕES/g, 'AÇÕES');

// Modal/Inputs
code = code.replace(/rounded-sm/g, 'rounded-xl'); // Let's make everything rounded-xl for consistency

fs.writeFileSync('src/views/MasterPortal.tsx', code);
console.log('Final polish applied.');
