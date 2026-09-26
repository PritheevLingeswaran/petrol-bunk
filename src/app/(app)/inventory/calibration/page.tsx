import { CalibrationMaster } from "@/components/master/calibration-master";
import { fieldsFor } from "@/components/master/config";
import { getMasterOptions, listMaster } from "@/server/master/queries";
export default async function Page() {
  const [records, options] = await Promise.all([
    listMaster("calibration"),
    getMasterOptions(),
  ]);
  return (
    <CalibrationMaster
      records={records}
      fields={fieldsFor("calibration", options)}
      tanks={options.tanks}
    />
  );
}
