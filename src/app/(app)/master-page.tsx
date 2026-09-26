import { MasterScreen } from "@/components/master/master-screen";
import { fieldsFor } from "@/components/master/config";
import { getMasterOptions, listMaster } from "@/server/master/queries";
import type { MasterEntity } from "@/server/master/schemas";

type Props = { entity: MasterEntity; title: string; description: string; columns: string[]; immutable?: boolean };

export async function MasterPage({ entity, title, description, columns, immutable }: Props) {
  const [records, options] = await Promise.all([listMaster(entity), getMasterOptions()]);
  return <MasterScreen entity={entity} title={title} description={description} records={records} fields={fieldsFor(entity, options)} columns={columns} immutable={immutable} />;
}
