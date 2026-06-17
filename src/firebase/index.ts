'use client';
// Single barrel export — everything comes from client-provider now.
export {
  FirebaseClientProvider,
  useAuthContext,
  useAuth,
  useUser,
} from './client-provider';
