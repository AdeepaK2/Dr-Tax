package expo.modules.smsreader

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads SMS messages from the Android inbox (content://sms/inbox).
 * Needs the READ_SMS runtime permission, which the JS side requests.
 */
class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val inbox: Uri = Uri.parse("content://sms/inbox")

  // "Peoples Bank" and "PEOPLESBANK" should match, so compare letters/digits only.
  private fun normalize(value: String?): String =
    (value ?: "").uppercase().filter { it.isLetterOrDigit() }

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    // Messages received after `sinceMs`, oldest first, from the given senders only.
    AsyncFunction("readInbox") { sinceMs: Double, senders: List<String> ->
      val wanted = senders.map { normalize(it) }.filter { it.isNotEmpty() }.toSet()
      val out = ArrayList<Map<String, Any>>()
      context.contentResolver.query(
        inbox,
        arrayOf("_id", "address", "body", "date"),
        "date > ?",
        arrayOf(sinceMs.toLong().toString()),
        "date ASC"
      )?.use { c ->
        val iId = c.getColumnIndexOrThrow("_id")
        val iAddress = c.getColumnIndexOrThrow("address")
        val iBody = c.getColumnIndexOrThrow("body")
        val iDate = c.getColumnIndexOrThrow("date")
        while (c.moveToNext()) {
          val address = c.getString(iAddress) ?: continue
          if (normalize(address) !in wanted) continue
          out.add(
            mapOf(
              "id" to c.getLong(iId).toString(),
              "address" to address,
              "body" to (c.getString(iBody) ?: ""),
              "date" to c.getLong(iDate).toDouble()
            )
          )
        }
      }
      out
    }

    // Sender IDs with message counts, to help find a bank's exact sender name.
    AsyncFunction("listSenders") { limit: Int ->
      val counts = HashMap<String, Int>()
      context.contentResolver.query(inbox, arrayOf("address"), null, null, null)?.use { c ->
        val iAddress = c.getColumnIndexOrThrow("address")
        while (c.moveToNext()) {
          val address = c.getString(iAddress) ?: continue
          // Skip normal phone numbers; bank senders are alphanumeric IDs.
          if (address.any { it.isLetter() }) counts[address] = (counts[address] ?: 0) + 1
        }
      }
      counts.entries
        .sortedByDescending { it.value }
        .take(limit)
        .map { mapOf("address" to it.key, "count" to it.value) }
    }
  }
}
