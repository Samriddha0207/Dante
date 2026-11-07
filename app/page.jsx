import AppShell from './app-shell';
import SubmissionLanding from './submission-landing';

export default function Home() {
  if (process.env.DANTE_SUBMISSION_LANDING === '1') return <SubmissionLanding />;
  return <AppShell />;
}
