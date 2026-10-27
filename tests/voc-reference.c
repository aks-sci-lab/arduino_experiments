#include <stdio.h>
#include "sensirion_gas_index_algorithm.h"

int main(void) {
    GasIndexAlgorithmParams params;
    int sraw;
    int32_t index;
    GasIndexAlgorithm_init(&params, GasIndexAlgorithm_ALGORITHM_TYPE_VOC);
    while (scanf("%d", &sraw) == 1) {
        GasIndexAlgorithm_process(&params, sraw, &index);
        printf("%d\n", index);
    }
    return 0;
}
