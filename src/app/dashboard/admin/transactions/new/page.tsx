// Redirect to unified Add Transaction form
import { redirect } from 'next/navigation';

export default function OldAddTransactionRedirect() {
  redirect('/dashboard/transactions/new');
}
