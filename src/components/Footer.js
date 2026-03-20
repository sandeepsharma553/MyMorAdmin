export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-blue-600 text-white p-3 text-center header">
      &copy; {year} My Mor. All rights reserved.
    </footer>
  );
}