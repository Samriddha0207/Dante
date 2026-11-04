import './globals.css';

export const metadata = {
  title: 'Dante | Brand intelligence',
  description: 'Evidence-linked brand guidance and content review.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><head><link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/improvements.css"/></head><body>{children}</body></html>;
}
