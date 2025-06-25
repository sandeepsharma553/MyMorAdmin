import React from 'react';
import { Mail, Phone } from 'lucide-react';
import logoImage from "../assets/logo1.png";
const SupportPage = () => {
    return (
        <div className="flex flex-col min-h-screen bg-black text-white">

            <header className="flex items-center p-4">

                <img
                    src={logoImage}
                    alt="MyMor logo"
                    className="h-14 w-14 mr-3 select-none"
                />
                <span className="text-2xl font-semibold text-fuchsia-400">mymor</span>
            </header>


            <main className="flex flex-col flex-grow items-center justify-center text-center space-y-8 px-4">
                <h1 className="text-5xl font-extrabold text-fuchsia-400">Have questions?</h1>
                <p className="text-2xl">Ask us!</p>

                <div className="space-y-6">
                    <a
                        href="mailto:mymormarket@gmail.com"
                        className="flex items-center space-x-3 group"
                    >
                        <Mail className="h-7 w-7 text-sky-400 transition-transform group-hover:scale-110" />
                        <span className="underline decoration-sky-400">mymormarket@gmail.com</span>
                    </a>

                    <a
                        href="tel:+26775980764"
                        className="flex items-center space-x-3 group"
                    >
                        <Phone className="h-7 w-7 text-sky-400 transition-transform group-hover:scale-110" />
                        <span className="underline decoration-sky-400">+267&nbsp;75980764</span>
                    </a>
                </div>
            </main>


            <footer className="text-center text-sm text-neutral-400 py-4">
                © 2022 MyMor Technology Pty Ltd
            </footer>
        </div>
    );
};

export default SupportPage;
