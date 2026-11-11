import { redirect } from "next/navigation";
import routes from "../../../routes";

/**
 * /tutor/pagos used to show made-up transactions (a hardcoded list and a fixed
 * balance). A tutor's real payments live in Estadísticas, so any old link lands there.
 */
export default function TutorPagosPage() {
  redirect(routes.TUTOR_STATISTICS);
}
