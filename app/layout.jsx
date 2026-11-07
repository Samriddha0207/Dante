import './globals.css';
import './submission.css';

export const metadata = {
  title: process.env.DANTE_SUBMISSION_LANDING === '1' ? 'Dante | Brand guidance that stays current' : 'Dante | Brand intelligence',
  description: 'Evidence-linked brand guidance and content review.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><head><link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/improvements.css"/></head><body>{children}</body></html>;
}
