# Project Rules

- **Force Logout on Every Turn**: Every time you make a change to the code, you MUST increment the `SYSTEM_VERSION` constant in `src/App.tsx`. This ensures the user is redirected to the login screen to test the full flow with the new changes.
- **Reboot a pedido**: Se o usuário pedir reboot do sistema, atualização forçada dos clientes ou disser que quer reboot em todo prompt, incremente `SYSTEM_VERSION` em `src/App.tsx` nessa mesma rodada (mesmo sem outras alterações de código), para disparar logout + reload.
- **Language Preference**: All responses from the AI must be in Portuguese (PT-BR), as requested by the user.
