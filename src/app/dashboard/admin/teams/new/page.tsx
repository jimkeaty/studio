import TeamForm from '@/components/admin/teams/TeamForm';

export default function NewTeamPage() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">New Team</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create a team and link it to its default commission plan.
        </p>
      </div>

      <TeamForm submitLabel="Create Team" />
    </main>
  );
}
