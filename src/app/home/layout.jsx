import Header from "../components/Header/Header"
import "../globals.css";

export default function Layout({children}) {
    return(
        < >
        <link
            href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Poppins:wght@300;400;600&display=swap"
            rel="stylesheet"
            />
            <Header suppressHydrationWarning/>
            {children}
        </>
    );
}