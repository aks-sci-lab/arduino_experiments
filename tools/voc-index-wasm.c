#include "sensirion_gas_index_algorithm.h"

static GasIndexAlgorithmParams params;

void voc_reset(void) {
    GasIndexAlgorithm_init(&params, GasIndexAlgorithm_ALGORITHM_TYPE_VOC);
}

int32_t voc_process(int32_t sraw) {
    int32_t index;
    GasIndexAlgorithm_process(&params, sraw, &index);
    return index;
}
