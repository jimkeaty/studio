// Redirect to unified Add Transaction form
import { redirect } from 'next/navigation';

export default function OldTcSubmitRedirect() {
  redirect('/dashboard/transactions/new');
}
