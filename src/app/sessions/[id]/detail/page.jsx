"use client";

import SessionDetailView from "../../../components/SessionDetailView/SessionDetailView";
import { useParams } from "next/navigation";

export default function SessionDetailPage() {
  const { id } = useParams();
  return <SessionDetailView sessionId={id} />;
}
